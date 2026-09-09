import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import {
  isToolCallEventType,
  type ExtensionContext,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import {
  collectGitContext,
  currentHead,
  isClean,
  isGitRepo,
  isReadOnlyGitCommand,
  listRemotes,
  readCurrentSnapshot,
  runGit,
  upstreamRemote,
} from "./git.js";
import {
  choosePushRemote,
  chooseTargetRemote,
  detectProvider,
  findTargetBranch,
  normalizeTargetRepository,
  providerCli,
  repositoryName,
} from "./remote.js";
import {
  checkProvider,
  createRequestArgs,
  listExistingRequests,
  updateRequestArgs,
} from "./providers.js";
import {
  formatCommitPlan,
  formatRequestDraft,
  parseCommandArgs,
  validateCommitGroups,
  validationFailures,
} from "./workflow.js";
import type {
  CommitGroup,
  ExistingRequest,
  ProviderKind,
  ValidationResult,
  WorkflowState,
} from "./types.js";

const COMMIT_TOOL = "herald_commit_plan";
const REQUEST_TOOL = "herald_request_plan";
const CONTEXT_TOOL = "herald_git_context";
const HERALD_TOOLS = [COMMIT_TOOL, REQUEST_TOOL, CONTEXT_TOOL];

const commitPlanSchema = Type.Object({
  commits: Type.Array(
    Type.Object({
      files: Type.Array(Type.String(), { minItems: 1 }),
      message: Type.String(),
    }),
    { minItems: 1 },
  ),
  untouchedFiles: Type.Optional(Type.Array(Type.String())),
  validation: Type.Optional(
    Type.Array(
      Type.Object({
        command: Type.String(),
        result: Type.String(),
        passed: Type.Boolean(),
        required: Type.Optional(Type.Boolean()),
      }),
    ),
  ),
});

type CommitPlanInput = Static<typeof commitPlanSchema>;

const requestPlanSchema = Type.Object({
  title: Type.String(),
  body: Type.String(),
});

type RequestPlanInput = Static<typeof requestPlanSchema>;

interface ActiveWorkflow {
  state: WorkflowState;
  previousTools: string[];
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated]`;
}

function providerLabel(provider: ProviderKind | undefined): string {
  return provider === "github" ? "GitHub" : provider === "gitlab" ? "GitLab" : "unknown provider";
}

function gitWriteAttempt(command: string): boolean {
  return /\bgit(?:\s|$)/.test(command);
}

function noUiResult(message: string) {
  return textResult(message, { blocked: true });
}

const heraldExtension: ExtensionFactory = (pi) => {
  let active: ActiveWorkflow | undefined;

  function persistState(): void {
    if (!active) return;
    const state = { ...active.state, context: { ...active.state.context, stagedDiff: "", unstagedDiff: "" } };
    pi.appendEntry("git-integration-state", state);
  }

  function restoreTools(): void {
    if (!active) return;
    pi.setActiveTools(active.previousTools);
  }

  function finish(stage: "completed" | "cancelled" | "failed", error?: string): void {
    if (!active) return;
    active.state.stage = stage;
    active.state.lastError = error;
    persistState();
    restoreTools();
    active = undefined;
  }

  function cancel(ctx?: ExtensionContext, reason = "Herald workflow cancelled."): void {
    if (!active) return;
    finish("cancelled", reason);
    if (ctx?.hasUI) ctx.ui.notify(reason, "warning");
  }

  function requireWorkflow(stage?: WorkflowState["stage"]): ActiveWorkflow {
    if (!active) throw new Error("No Herald workflow is active.");
    if (stage && active.state.stage !== stage) {
      throw new Error(`Herald is in '${active.state.stage}' stage, not '${stage}'.`);
    }
    return active;
  }

  async function ensureSnapshot(workflow: ActiveWorkflow): Promise<void> {
    const current = await readCurrentSnapshot(pi, workflow.state.cwd);
    if (current !== workflow.state.context.snapshot) {
      throw new Error("The working tree changed after the plan was created. Submit a new Herald plan.");
    }
  }

  async function choosePlanAction(ctx: ExtensionContext, title: string, plan: string): Promise<string | undefined> {
    if (!ctx.hasUI) return undefined;
    ctx.ui.notify(plan, "info");
    return ctx.ui.select(title, ["Approve", "Revise", "Cancel"]);
  }

  async function revise(ctx: ExtensionContext, message: string): Promise<string> {
    if (!ctx.hasUI) return "Revision requested, but no user interface is available.";
    return (await ctx.ui.input(message, ""))?.trim() || "The user requested a revision without additional feedback.";
  }

  async function createBodyFile(body: string): Promise<{ directory: string; file: string }> {
    const directory = await mkdtemp(join(tmpdir(), "pi-herald-"));
    const file = join(directory, "request.md");
    await writeFile(file, body, "utf8");
    return { directory, file };
  }

  async function targetHead(workflow: ActiveWorkflow): Promise<string | undefined> {
    if (!workflow.state.targetRemote || !workflow.state.targetBranch) return undefined;
    const result = await runGit(pi, workflow.state.cwd, [
      "rev-parse",
      `${workflow.state.targetRemote.name}/${workflow.state.targetBranch}`,
    ]);
    return result.code === 0 ? result.stdout : undefined;
  }

  async function handleTargetChange(workflow: ActiveWorkflow, ctx: ExtensionContext): Promise<boolean> {
    if (workflow.state.targetRemote) {
      const fetched = await runGit(pi, workflow.state.cwd, ["fetch", "--no-tags", workflow.state.targetRemote.name], 120_000);
      if (fetched.code !== 0) throw new Error(`Could not refresh ${workflow.state.targetRemote.name}: ${fetched.stderr}`);
    }
    const currentTargetHead = await targetHead(workflow);
    if (!workflow.state.targetHead || !currentTargetHead || currentTargetHead === workflow.state.targetHead) return true;
    if (!ctx.hasUI) throw new Error("The target branch changed and no UI is available for synchronization.");

    const choice = await ctx.ui.select("The target branch changed. Choose an action.", [
      "Continue without synchronizing",
      "Rebase onto the target branch",
      "Merge the target branch",
      "Cancel",
    ]);
    if (choice === "Cancel" || !choice) return false;
    if (choice === "Continue without synchronizing") return true;

    const targetRef = `${workflow.state.targetRemote!.name}/${workflow.state.targetBranch!}`;
    const command = choice.startsWith("Rebase") ? ["rebase", targetRef] : ["merge", targetRef];
    const approved = await ctx.ui.confirm("Synchronize source branch", `Run git ${command.join(" ")}?`);
    if (!approved) return false;
    const result = await runGit(pi, workflow.state.cwd, command);
    if (result.code !== 0) {
      throw new Error(`${command[0]} failed. Resolve or abort the operation manually.\n${result.stderr}`);
    }
    throw new Error("The source branch changed. Create a new Herald plan.");
  }

  async function push(workflow: ActiveWorkflow): Promise<void> {
    const branch = workflow.state.context.branch;
    const remote = workflow.state.pushRemote?.name;
    if (!remote) throw new Error("No push remote is available.");
    const tracked = await upstreamRemote(pi, workflow.state.cwd);
    const args = tracked
      ? ["push"]
      : ["push", "--set-upstream", remote, branch];
    const result = await runGit(pi, workflow.state.cwd, args, 120_000);
    if (result.code !== 0) throw new Error(result.stderr || "Git push failed.");
  }

  function requestArgs(workflow: ActiveWorkflow, title: string, bodyFile: string): {
    provider: ProviderKind;
    host: string;
    targetRepository: string;
    input: Parameters<typeof createRequestArgs>[0];
  } {
    const provider = workflow.state.provider;
    const host = workflow.state.providerHost;
    const targetRepository = workflow.state.targetRepository;
    const sourceRepository = workflow.state.pushRemote?.repository;
    const sourceBranch = workflow.state.context.branch;
    const targetBranch = workflow.state.targetBranch;
    if (!provider || !host || !targetRepository || !sourceRepository || !targetBranch) {
      throw new Error("Herald has incomplete provider or target information.");
    }
    return {
      provider,
      host,
      targetRepository,
      input: {
        provider,
        host,
        targetRepository,
        sourceRepository,
        sourceBranch,
        targetBranch,
        title,
        bodyFile,
      },
    };
  }

  async function findRequest(workflow: ActiveWorkflow): Promise<ExistingRequest[]> {
    if (!workflow.state.provider || !workflow.state.providerHost || !workflow.state.targetRepository || !workflow.state.targetBranch) return [];
    return listExistingRequests(
      pi,
      workflow.state.provider,
      workflow.state.providerHost,
      workflow.state.targetRepository,
      workflow.state.context.branch,
      workflow.state.targetBranch,
      workflow.state.pushRemote?.repository,
    );
  }

  async function executeRequest(workflow: ActiveWorkflow, request: ExistingRequest | undefined, title: string, body: string): Promise<string> {
    const temp = await createBodyFile(body);
    const requestData = requestArgs(workflow, title, temp.file);
    try {
      await push(workflow);
      const cli = providerCli(requestData.provider);
      const args = request
        ? updateRequestArgs(requestData.input, request.id)
        : createRequestArgs(requestData.input);
      const result = await pi.exec(cli, args, { timeout: 120_000 });
      if (result.code === 0) {
        const url = result.stdout.match(/https?:\/\/\S+/)?.[0];
        return url ?? (result.stdout || `Request ${request ? "updated" : "created"}.`);
      }

      const afterFailure = await findRequest(workflow);
      const matching = afterFailure.find((item) => item.state === "open" || item.state === "merged");
      if (matching) return matching.url;
      throw new Error(result.stderr || `${cli} request command failed.`);
    } finally {
      await rm(temp.directory, { recursive: true, force: true });
    }
  }

  async function executeCommitPlan(input: CommitPlanInput, ctx: ExtensionContext) {
    const workflow = requireWorkflow("commit-plan");
    const groups: CommitGroup[] = input.commits.map((commit) => ({ files: commit.files, message: commit.message }));
    const untouchedFiles = input.untouchedFiles ?? [];
    const validation: ValidationResult[] = input.validation ?? [];
    const errors = validateCommitGroups(groups, workflow.state.context.changedFiles, untouchedFiles);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    await ensureSnapshot(workflow);
    if (!ctx.hasUI) return noUiResult("Herald cannot commit without an approval UI.");

    const plan = formatCommitPlan(groups, untouchedFiles, validation);
    const action = await choosePlanAction(ctx, "Approve Herald commit plan?", plan);
    if (action === "Revise") {
      const feedback = await revise(ctx, "What should Herald change in the commit plan?");
      return textResult(`Revise the commit plan. User feedback: ${feedback}`, { revised: true });
    }
    if (action !== "Approve") {
      cancel(ctx, "Herald commit plan cancelled.");
      return textResult("Herald commit plan cancelled.", { cancelled: true });
    }

    const failures = validationFailures(validation);
    if (failures.length > 0) {
      const confirmed = await ctx.ui.confirm(
        "Validation failed",
        `${failures.map((failure) => `${failure.command}: ${failure.result}`).join("\n")}\n\nCommit anyway?`,
      );
      if (!confirmed) {
        cancel(ctx, "Commit stopped because validation failed.");
        return textResult("Commit stopped because validation failed.", { cancelled: true });
      }
      const requiredFailure = failures.some((failure) => failure.required);
      if (requiredFailure) {
        const reason = await ctx.ui.input("Why should Herald continue despite a required failure?", "");
        if (!reason?.trim()) {
          cancel(ctx, "Commit stopped because no validation override reason was provided.");
          return textResult("Commit stopped because no override reason was provided.", { cancelled: true });
        }
      }
    }

    const branch = workflow.state.context.branch;
    if (["main", "master", "develop"].includes(branch) || branch === workflow.state.targetBranch) {
      const confirmed = await ctx.ui.confirm(
        "Default or target branch",
        `The current branch is ${branch}. Create commits on this branch?`,
      );
      if (!confirmed) {
        cancel(ctx, "Commit stopped on the default or target branch.");
        return textResult("Commit stopped on the default or target branch.", { cancelled: true });
      }
    }

    const hashes: string[] = [];
    for (const group of groups) {
      const add = await runGit(pi, workflow.state.cwd, ["add", "--", ...group.files]);
      if (add.code !== 0) {
        const error = add.stderr || "Could not stage commit files.";
        finish("failed", error);
        throw new Error(error);
      }
      const commit = await runGit(pi, workflow.state.cwd, ["commit", "--only", "-m", group.message, "--", ...group.files]);
      if (commit.code !== 0) {
        const error = commit.stderr || "Git commit failed.";
        finish("failed", error);
        throw new Error(error);
      }
      hashes.push(await currentHead(pi, workflow.state.cwd));
    }

    workflow.state.commits.push(...hashes);
    workflow.state.context = await collectGitContext(pi, workflow.state.cwd);
    workflow.state.sourceHead = await currentHead(pi, workflow.state.cwd);
    workflow.state.stage = workflow.state.options.mode === "both" ? "request-plan" : "completed";
    persistState();
    if (workflow.state.stage === "completed") finish("completed");
    return textResult(
      `Created ${hashes.length} commit(s):\n${hashes.map((hash) => `- ${hash}`).join("\n")}\n${workflow.state.options.mode === "both" ? "Submit a request plan next." : "Herald commit workflow completed."}`,
      { commits: hashes },
    );
  }

  async function executeRequestPlan(input: RequestPlanInput, ctx: ExtensionContext) {
    const workflow = requireWorkflow("request-plan");
    if (!input.title.trim() || !input.body.trim()) throw new Error("Request title and body are required.");
    const freshContext = await collectGitContext(pi, workflow.state.cwd);
    if (!workflow.state.options.allowDirty && !isClean(freshContext.status)) {
      throw new Error("The working tree is not clean. Use --allow-dirty to continue explicitly.");
    }
    if (workflow.state.sourceHead && workflow.state.sourceHead !== await currentHead(pi, workflow.state.cwd)) {
      throw new Error("The source branch changed after the commit plan. Create a new request plan.");
    }
    if (!(await handleTargetChange(workflow, ctx))) {
      cancel(ctx, "Request workflow cancelled.");
      return textResult("Request workflow cancelled.", { cancelled: true });
    }

    let title = input.title.trim();
    let body = input.body.trim();
    const existing = await findRequest(workflow);
    let selected: ExistingRequest | undefined;
    if (existing.length > 1 && ctx.hasUI) {
      const choice = await ctx.ui.select(
        "Several matching requests exist. Select one.",
        existing.map((item) => `${item.state}: ${item.title || item.id} — ${item.url}`),
      );
      selected = existing[existing.findIndex((item) => `${item.state}: ${item.title || item.id} — ${item.url}` === choice)];
    } else {
      selected = existing[0];
    }

    if (selected?.state === "merged") {
      finish("completed");
      return textResult(`The request is already merged: ${selected.url}`, { url: selected.url, existing: true });
    }
    if (selected?.state === "closed") {
      const createNew = ctx.hasUI && await ctx.ui.confirm("Closed request found", `Create a new request?\n${selected.url}`);
      if (!createNew) {
        cancel(ctx, "No new request created.");
        return textResult(`No new request created. Existing request: ${selected.url}`, { existing: true });
      }
      selected = undefined;
    }
    if (selected?.state === "open") {
      const action = ctx.hasUI ? await ctx.ui.select("An open request already exists.", ["Update existing", "Leave unchanged", "Cancel"]) : "Cancel";
      if (action === "Leave unchanged") {
        finish("completed");
        return textResult(`Existing request: ${selected.url}`, { url: selected.url, existing: true });
      }
      if (action !== "Update existing") {
        cancel(ctx, "Request update cancelled.");
        return textResult("Request update cancelled.", { cancelled: true });
      }
    }

    if (ctx.hasUI) {
      const edited = await ctx.ui.editor("Edit the request title on the first line and the body below it.", `${title}\n\n${body}`);
      if (edited?.trim()) {
        const lines = edited.split("\n");
        title = lines.shift()?.trim() ?? title;
        body = lines.join("\n").trim();
      }
    }
    const dirtyWarning = workflow.state.options.allowDirty && !isClean(freshContext.status)
      ? `WARNING: local changes are not part of this request.\n\n${freshContext.status}\n\n`
      : "";
    const draft = `${dirtyWarning}${formatRequestDraft(title, body, workflow.state.provider!, workflow.state.targetRepository!, workflow.state.targetBranch!)}`;
    const action = await choosePlanAction(ctx, "Approve Herald request?", draft);
    if (action === "Revise") {
      const feedback = await revise(ctx, "What should Herald change in the request draft?");
      return textResult(`Revise the request draft. User feedback: ${feedback}`, { revised: true });
    }
    if (action !== "Approve") {
      cancel(ctx, "Request cancelled.");
      return textResult("Request cancelled.", { cancelled: true });
    }

    const currentHeadValue = await currentHead(pi, workflow.state.cwd);
    if (workflow.state.sourceHead && currentHeadValue !== workflow.state.sourceHead) {
      throw new Error("The source branch changed after approval. Create a new request plan.");
    }
    const url = await executeRequest(workflow, selected, title, body);
    finish("completed");
    return textResult(url, { url, updated: Boolean(selected) });
  }

  pi.on("session_start", (_event, ctx) => {
    const previousTools = pi.getActiveTools().filter((name) => !HERALD_TOOLS.includes(name));
    const entries = ctx.sessionManager.getEntries();
    const last = [...entries].reverse().find((entry) =>
      entry.type === "custom" && entry.customType === "git-integration-state",
    );
    const restored = last?.type === "custom" ? last.data as Partial<WorkflowState> : undefined;
    if (!restored || restored.stage === "completed" || restored.stage === "cancelled" || restored.stage === "failed") {
      pi.setActiveTools(previousTools);
      return;
    }
    if (!restored.cwd || !restored.options || !restored.context) {
      pi.setActiveTools(previousTools);
      return;
    }
    active = {
      state: restored as WorkflowState,
      previousTools,
    };
    pi.setActiveTools([...new Set([...previousTools, ...HERALD_TOOLS])]);
    if (ctx.hasUI) ctx.ui.notify(`Resumed Herald at the ${active.state.stage} stage.`, "info");
  });

  pi.registerTool({
    name: CONTEXT_TOOL,
    label: "Herald Git Context",
    description: "Read current Git status, diffs, branch, and recent commits for an active Herald workflow. This tool is read-only.",
    promptSnippet: "Read Git context during an active Herald workflow",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute() {
      const workflow = requireWorkflow();
      const context = await collectGitContext(pi, workflow.state.cwd);
      return textResult(
        [
          `Branch: ${context.branch || "(detached)"}`,
          `Status:\n${context.status || "(clean)"}`,
          `Recent commits:\n${context.recentCommits || "(none)"}`,
          `Staged diff:\n${truncate(context.stagedDiff, 12_000) || "(none)"}`,
          `Unstaged diff:\n${truncate(context.unstagedDiff, 12_000) || "(none)"}`,
        ].join("\n\n"),
        { changedFiles: context.changedFiles },
      );
    },
  });

  pi.registerTool({
    name: COMMIT_TOOL,
    label: "Herald Commit Plan",
    description: "Submit a structured Herald commit plan. Herald validates the plan, asks for approval, and creates the approved commits.",
    promptSnippet: "Submit and approve a structured Git commit plan",
    promptGuidelines: ["Use herald_commit_plan during commit-plan stage. Include every changed file in one commit group or untouchedFiles."],
    parameters: commitPlanSchema,
    executionMode: "sequential",
    async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
      return executeCommitPlan(input, ctx);
    },
  });

  pi.registerTool({
    name: REQUEST_TOOL,
    label: "Herald Request Plan",
    description: "Submit an MR or PR title and body. Herald edits, approves, pushes, and creates or updates the provider request.",
    promptSnippet: "Submit and approve a GitLab MR or GitHub PR draft",
    promptGuidelines: ["Use herald_request_plan during request-plan stage. Include the selected template content and validation results."],
    parameters: requestPlanSchema,
    executionMode: "sequential",
    async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
      return executeRequestPlan(input, ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (!active || !isToolCallEventType("bash", event)) return;
    if (gitWriteAttempt(event.input.command)) {
      return { block: true, reason: "Herald blocks direct Git commands during an active workflow. Use Herald tools." };
    }
  });

  pi.on("user_bash", async (event, ctx) => {
    if (!active || !gitWriteAttempt(event.command) || isReadOnlyGitCommand(event.command)) return;
    if (!ctx.hasUI) {
      return { result: { output: "Blocked: cancel Herald before running a manual Git write.", exitCode: 1, cancelled: false, truncated: false } };
    }
    const allowed = await ctx.ui.confirm(
      "Herald workflow active",
      "This command may change Git state and invalidate the active Herald plan. Allow it and cancel Herald?",
    );
    if (!allowed) {
      return { result: { output: "Blocked by Herald.", exitCode: 1, cancelled: false, truncated: false } };
    }
    cancel(ctx, "Herald cancelled before a manual Git command.");
  });

  pi.registerCommand("herald", {
    description: "Controlled Git commit and GitLab MR or GitHub PR workflow",
    handler: async (args, ctx) => {
      if (args.trim() === "cancel") {
        cancel(ctx);
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("Herald requires an approval UI.", "error");
        return;
      }
      if (active) {
        ctx.ui.notify("A Herald workflow is already active.", "warning");
        return;
      }
      const parsed = parseCommandArgs(args);
      if (parsed.errors.length > 0) {
        ctx.ui.notify(parsed.errors.join("\n"), "error");
        return;
      }
      if (!(await isGitRepo(pi, ctx.cwd))) {
        ctx.ui.notify("Not a Git repository.", "error");
        return;
      }
      let contributionPolicy: string;
      try {
        contributionPolicy = await readFile(join(ctx.cwd, "CONTRIBUTING.md"), "utf8");
      } catch {
        ctx.ui.notify("Herald requires a readable CONTRIBUTING.md before it can start.", "error");
        return;
      }
      void contributionPolicy;

      try {
        const remotes = await listRemotes(pi, ctx.cwd);
        const tracked = await upstreamRemote(pi, ctx.cwd);
        const pushRemote = choosePushRemote(remotes, tracked, parsed.options.pushRemote);
        const targetRemote = chooseTargetRemote(remotes, pushRemote, parsed.options.targetRemote);
        for (const remote of new Set([pushRemote.name, targetRemote.name])) {
          const fetched = await runGit(pi, ctx.cwd, ["fetch", "--no-tags", remote], 120_000);
          if (fetched.code !== 0) throw new Error(`Could not fetch ${remote}: ${fetched.stderr}`);
        }

        const explicitTarget = parsed.options.targetRepository
          ? normalizeTargetRepository(parsed.options.targetRepository, targetRemote.host)
          : undefined;
        const providerHost = explicitTarget?.host ?? targetRemote.host;
        const targetRepository = explicitTarget?.repository ?? repositoryName(targetRemote);
        const provider = parsed.options.mode === "commit"
          ? parsed.options.provider
          : await detectProvider(pi, ctx.cwd, providerHost, targetRepository, parsed.options.provider);
        const targetBranch = await findTargetBranch(pi, ctx.cwd, targetRemote, parsed.options.targetBranch);
        const resolvedTargetBranch = targetBranch ?? await ctx.ui.input("Target branch", "main");
        if (!resolvedTargetBranch?.trim()) throw new Error("A target branch is required.");
        if (parsed.options.mode !== "commit" && provider) await checkProvider(pi, provider, targetRemote.host, targetRepository);

        const context = await collectGitContext(pi, ctx.cwd);
        if (parsed.options.mode === "request" && !parsed.options.allowDirty && !isClean(context.status)) {
          throw new Error("Request mode requires a clean working tree. Use --allow-dirty to continue explicitly.");
        }
        if (parsed.options.mode === "both" && context.changedFiles.length === 0) {
          throw new Error("Full mode requires uncommitted changes. Use /herald request for existing commits.");
        }

        const sourceHead = await currentHead(pi, ctx.cwd);
        const targetHeadResult = await runGit(pi, ctx.cwd, ["rev-parse", `${targetRemote.name}/${resolvedTargetBranch}`]);
        const state: WorkflowState = {
          options: parsed.options,
          stage: parsed.options.mode === "commit" || parsed.options.mode === "both" ? "commit-plan" : "request-plan",
          cwd: ctx.cwd,
          context,
          provider,
          providerHost,
          pushRemote,
          targetRemote,
          targetRepository,
          targetBranch: resolvedTargetBranch.trim(),
          sourceHead,
          targetHead: targetHeadResult.code === 0 ? targetHeadResult.stdout : undefined,
          commits: [],
        };
        active = { state, previousTools: pi.getActiveTools() };
        pi.setActiveTools([...new Set([...active.previousTools, ...HERALD_TOOLS])]);
        persistState();

        ctx.ui.notify(
          [
            `Provider: ${providerLabel(provider)}${targetRemote.host ? ` (${targetRemote.host})` : ""}`,
            `Branch: ${context.branch || "(detached)"}`,
            `Push remote: ${pushRemote.name}`,
            `Target: ${targetRepository}:${resolvedTargetBranch.trim()}`,
            `Changed files: ${context.changedFiles.length}`,
          ].join("\n"),
          "info",
        );
        pi.sendUserMessage(
          [
            "You are Herald. Follow the active Herald workflow.",
            "Read CONTRIBUTING.md before planning.",
            "Do not run Git commands through bash. Use herald_git_context for Git data.",
            `Current stage: ${state.stage}`,
            `Mode: ${parsed.options.mode}`,
            `Provider: ${providerLabel(provider)}`,
            `Target: ${targetRepository}:${resolvedTargetBranch.trim()}`,
            `Changed files: ${context.changedFiles.join(", ") || "none"}`,
            "Submit the required structured Herald tool call. Do not perform the write action outside that tool.",
            `Staged diff:\n${truncate(context.stagedDiff, 12_000)}`,
            `Unstaged diff:\n${truncate(context.unstagedDiff, 12_000)}`,
          ].join("\n\n"),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });
};

export default heraldExtension;
