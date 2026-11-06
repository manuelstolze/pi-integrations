import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  createAgentSession, DefaultResourceLoader, getAgentDir, initTheme, InteractiveMode, ModelRuntime,
  SessionManager, SettingsManager, type AgentSession, type ExtensionFactory, type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, type Terminal } from "@earendil-works/pi-tui";
import { registerGitIntegration } from "../src/interface/pi/extension.js";
import { FileHeraldSettings } from "../src/infrastructure/config/file-herald-settings.js";
import type { HeraldAdapters } from "../src/interface/pi/extension.js";
import type { HostingProvider } from "../src/domain/hosting-provider.js";

const directories: string[] = [];
const sessions: AgentSession[] = [];
const interactiveModes: InteractiveMode[] = [];
afterEach(async () => {
  interactiveModes.splice(0).forEach((mode) => mode.stop());
  sessions.splice(0).forEach((session) => session.dispose());
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const adapters = (provider: HostingProvider = "github"): HeraldAdapters => ({
  git: {
    isRepository: async () => true,
    originUrl: async () => provider === "github" ? "https://github.com/example/repo.git" : "https://gitlab.example/group/repo.git",
    snapshot: async () => ({ branch: "feature/test", status: " M file", stagedDiff: "", unstagedDiff: "change", recentCommits: "" }),
    refExists: async (ref) => provider === "gitlab" && ref === "origin/develop",
    diffAgainst: async () => "",
  },
  hosting: { resolve: async () => provider, defaultBranch: async () => "main" },
  commitInputChecks: {
    prepare: async (draft) => ({ ok: true, proposal: {
      stage: "commit", commits: draft.commits.map((commit) => ({
        ...commit,
        command: `git add -- ${commit.files.map((file) => shellQuote(`:(literal)${file}`)).join(" ")} && git commit -m ${shellQuote(commit.message)}`,
        inputSnapshot: "commit-test-snapshot",
      })),
    } }),
    verify: async () => ({ ok: true }),
  },
  requestInputChecks: (selectedProvider) => ({
    prepare: async (draft) => {
      const pushAlreadyCompleted = draft.pushAlreadyCompleted ?? false;
      const descriptionArg = draft.descriptionInput.kind === "file"
        ? selectedProvider === "github" ? `--body-file ${shellQuote(draft.descriptionInput.path)}` : `--description-file ${shellQuote(draft.descriptionInput.path)}`
        : selectedProvider === "github" ? `--body ${shellQuote(draft.description)}` : `--description ${shellQuote(draft.description)}`;
      const commands = pushAlreadyCompleted ? [] : [{
        action: "push" as const,
        command: `git push origin ${shellQuote(`${draft.sourceBranch}:${draft.sourceBranch}`)}`,
        inputSnapshot: "push-test-snapshot",
      }];
      commands.push({
        action: "create" as const,
        command: selectedProvider === "github"
          ? `gh pr create --base ${shellQuote(draft.targetBranch)} --head ${shellQuote(draft.sourceBranch)} --title ${shellQuote(draft.title)} ${descriptionArg}`
          : `glab mr create --source-branch ${shellQuote(draft.sourceBranch)} --target-branch ${shellQuote(draft.targetBranch)} --title ${shellQuote(draft.title)} ${descriptionArg} --remove-source-branch --yes`,
        inputSnapshot: "request-test-snapshot",
      });
      return { ok: true, proposal: { ...draft, pushAlreadyCompleted, commands } };
    },
    verify: async () => ({ ok: true }),
  }),
});

class CapturingTerminal implements Terminal {
  output = "";
  private inputHandler?: (data: string) => void;
  readonly columns = 180;
  readonly rows = 100;
  readonly kittyProtocolActive = false;

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.inputHandler = onInput;
    onResize();
  }
  stop(): void { this.inputHandler = undefined; }
  async drainInput(): Promise<void> {}
  write(data: string): void { this.output += data; }
  moveBy(lines: number): void { this.write(`\u001b[${Math.abs(lines)}${lines < 0 ? "A" : "B"}`); }
  hideCursor(): void { this.write("\u001b[?25l"); }
  showCursor(): void { this.write("\u001b[?25h"); }
  clearLine(): void { this.write("\u001b[2K"); }
  clearFromCursor(): void { this.write("\u001b[J"); }
  clearScreen(): void { this.write("\u001b[2J\u001b[H"); }
  setTitle(title: string): void { this.write(`\u001b]0;${title}\u0007`); }
  setProgress(_active: boolean): void {}
  setProgramStatus(_status: Parameters<Terminal["setProgramStatus"]>[0]): void {}
}

interface ScriptedResponse {
  text?: string;
  call?: { name: string; arguments: Record<string, unknown> };
  error?: string;
}

function scriptedContextText(context: unknown): string {
  const messages = (context as { messages?: Array<{ content?: unknown }> }).messages ?? [];
  return messages.map((message) => {
    if (typeof message.content === "string") return message.content;
    if (!Array.isArray(message.content)) return "";
    return message.content.map((part) => {
      if (typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part) {
        return String(part.text);
      }
      return "";
    }).join("\n");
  }).join("\n");
}

function resolveScriptedResponse(response: ScriptedResponse, context: unknown): ScriptedResponse {
  if (!response.call) return response;
  const text = scriptedContextText(context);
  const proposalIds = [...text.matchAll(/Proposal ([a-f0-9-]{36}) was shown in chat/g)].map((match) => match[1]);
  const commandMarker = "Use only these exact commands:\n";
  const commandMarkerIndex = text.lastIndexOf(commandMarker);
  const commandText = commandMarkerIndex >= 0 ? text.slice(commandMarkerIndex + commandMarker.length) : "";
  const commands = commandText.split("\n").filter((line) => /^- (?:git add --|git push origin|gh pr create|glab mr create)/.test(line))
    .map((line) => line.slice(2));
  const args = Object.fromEntries(Object.entries(response.call.arguments).map(([key, value]) => {
    if (value === "$proposalId") {
      const proposalId = proposalIds.at(-1);
      if (!proposalId) throw new Error("No proposal ID was present in the model context.");
      return [key, proposalId];
    }
    if (typeof value === "string" && value.startsWith("$command:")) {
      const index = Number(value.slice("$command:".length));
      if (!Number.isInteger(index) || !commands[index]) throw new Error(`No proposal command ${index} was present in the model context.`);
      return [key, commands[index]];
    }
    return [key, value];
  }));
  return { ...response, call: { ...response.call, arguments: args } };
}
const finishResponse: ScriptedResponse = {
  call: { name: "herald_finish", arguments: { status: "completed", summary: "No Git actions needed." } },
};

async function setup(options: {
  hold?: boolean;
  delayEvents?: boolean;
  script?: ScriptedResponse[];
  approve?: boolean;
  probe?: ExtensionFactory;
  terminal?: Terminal;
  provider?: HostingProvider;
  adapterFactory?: (cwd: string) => HeraldAdapters;
  bashOutcomes?: Array<{ error?: boolean; text?: string }>;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "herald-supported-host-"));
  directories.push(root);
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  await mkdir(agentDir);
  await mkdir(cwd);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  const settingsPath = join(agentDir, "settings.json");
  const content = JSON.stringify({ herald: { model: "herald-test/run", thinkingLevel: "low" } });
  await writeFile(settingsPath, content);
  const settingsManager = SettingsManager.inMemory({
    defaultThinkingLevel: "medium", compaction: { enabled: false }, retry: { enabled: false },
  });
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false,
  });
  const requests: Array<{ model: string; thinking: string | undefined; system: string }> = [];
  const executed = vi.fn();
  const confirm = vi.fn(async () => options.approve ?? true);
  const setStatus = vi.fn();
  let respond: () => void = () => { throw new Error("No request is active"); };
  runtime.registerProvider("herald-test", {
    api: "openai-completions", baseUrl: "http://unused.invalid", apiKey: "dummy-local-test-key",
    models: ["chat", "run", "manual"].map((id) => ({
      id, name: id, reasoning: true, input: ["text"], contextWindow: 100000, maxTokens: 1000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
    streamSimple: (model, context, streamOptions) => {
      const index = requests.length;
      const scripted = options.script?.[index] ?? (options.script ? { text: "Final summary." } : index === 0 ? finishResponse : { text: "No Git actions performed." });
      const response = resolveScriptedResponse(scripted, context);
      requests.push({ model: model.id, thinking: streamOptions?.reasoning,
        system: JSON.stringify(context.messages.filter((message) => message.role === "system")) });
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", api: "openai-completions", provider: model.provider, model: model.id,
        content: response.call
          ? [{ type: "toolCall", id: `call-${index}`, ...response.call }]
          : [{ type: "text", text: response.text ?? "Final summary." }],
        stopReason: response.call ? "toolUse" : "stop", timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      respond = () => {
        if (response.error) {
          stream.push({ type: "error", reason: "error", error: { ...message, stopReason: "error", errorMessage: response.error } });
        } else {
          stream.push({ type: "done", reason: response.call ? "toolUse" : "stop", message });
        }
        stream.end();
      };
      streamOptions?.signal?.addEventListener("abort", () => {
        const error = { ...message, stopReason: "aborted" as const, errorMessage: "Cancelled by test" };
        stream.push({ type: "error", reason: "aborted", error });
        stream.end();
      }, { once: true });
      if (!options.hold || index > 0) queueMicrotask(respond);
      return stream;
    },
  });
  const loader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true,
    extensionFactories: [
      (api) => {
        if (options.delayEvents) {
          api.on("thinking_level_select", async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
        }
      },
      (api) => {
        api.registerTool({
          name: "bash", label: "Fake Bash", description: "Record a command without executing it.",
          parameters: Type.Object({ command: Type.String() }),
          async execute(_id, args) {
            executed(args.command);
            const outcome = options.bashOutcomes?.shift() ?? {};
            return {
              content: [{ type: "text", text: outcome.text ?? "Test command recorded. No process was started." }],
              details: undefined,
              ...(outcome.error ? { isError: true } : {}),
            };
          },
        });
        if (options.probe) return options.probe(api);
        registerGitIntegration(api, options.adapterFactory ?? (() => adapters(options.provider)), new FileHeraldSettings(getAgentDir()));
      },
    ],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd, agentDir, modelRuntime: runtime, model: runtime.getModel("herald-test", "chat"), thinkingLevel: "high",
    resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd), settingsManager, noTools: true,
  });
  sessions.push(session);
  expect(extensionsResult.errors).toEqual([]);
  const errors: unknown[] = [];
  if (options.terminal) {
    initTheme("dark", false);
    const runtimeHost = {
      session,
      services: { agentDir },
      setBeforeSessionInvalidate: () => {},
      setRebindSession: () => {},
    } as unknown as ConstructorParameters<typeof InteractiveMode>[0];
    const mode = new InteractiveMode(runtimeHost, { terminal: options.terminal, initialThemeSetting: "dark" });
    interactiveModes.push(mode);
    await mode.init();
  } else {
    await session.bindExtensions({
      uiContext: { notify: vi.fn(), confirm, setStatus } as unknown as ExtensionUIContext,
      onError: (error) => errors.push(error),
      commandContextActions: {
        waitForIdle: () => session.waitForIdle(),
      } as Parameters<AgentSession["bindExtensions"]>[0]["commandContextActions"],
    });
  }
  return { session, runtime, requests, errors, settingsPath, content, executed, confirm, setStatus, respond: () => respond() };
}

async function waitForSettled(session: AgentSession, action: () => Promise<unknown>) {
  let unsubscribe: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    unsubscribe = session.subscribe((event) => { if (event.type === "agent_settled") resolve(); });
  });
  try {
    await action();
    await settled;
  } finally {
    unsubscribe();
  }
}

describe("Proposal delivery on a supported Pi host", () => {
  it.each(["interactive", "rpc"] as const)("emits the complete proposal before a later %s reply", async (source) => {
    const proposal = `Plan:\n${"Full commit message and exact command.\n".repeat(200)}END OF PROPOSAL`;
    const events: Array<{ kind: string; text?: string; source?: string; session?: string; waiting?: boolean }> = [];
    let waiting = false;
    let proposalSession = "";
    let reply: { session: string; proposal: string } | undefined;
    const reports: boolean[] = [];
    let sendExtensionInput: () => void = () => { throw new Error("Probe not registered"); };
    const report = { name: "probe_report", arguments: { proposal: "proposal-1" } };
    const h = await setup({ hold: true, script: [
      { call: { name: "probe_proposal", arguments: {} } },
      { text: "Waiting for a reply." },
      { text: "Queued input received." },
      { call: report },
      { text: "Extension input received." },
      { call: report },
      { text: "Human reply received." },
    ], probe: (api) => {
      sendExtensionInput = () => api.sendUserMessage("extension approval");
      api.on("input", async (event, ctx) => {
        if (event.text === "Start probe") api.setActiveTools(["probe_proposal", "probe_report", "bash"]);
        const session = ctx.sessionManager.getSessionId();
        events.push({ kind: "input", text: event.text, source: event.source, session, waiting });
        if (waiting && (event.source === "interactive" || event.source === "rpc")) {
          reply = { session, proposal: "proposal-1" };
        }
        return { action: "continue" };
      });
      api.on("agent_end", async () => { waiting = true; });
      api.registerTool({
        name: "probe_proposal", label: "Proposal probe", description: "Show a test proposal.",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, ctx) {
          waiting = false;
          proposalSession = ctx.sessionManager.getSessionId();
          reply = undefined;
          events.push({ kind: "proposal-call" });
          api.sendMessage({ customType: "proposal-probe", content: proposal, display: true }, { triggerTurn: false });
          return { content: [{ type: "text", text: "Proposal queued for display." }], details: undefined };
        },
      });
      api.registerTool({
        name: "probe_report", label: "Reply report probe", description: "Report a test reply.",
        parameters: Type.Object({ proposal: Type.String() }),
        async execute(_id, args, _signal, _update, ctx) {
          const accepted = waiting && reply?.proposal === args.proposal && reply.session === proposalSession
            && proposalSession === ctx.sessionManager.getSessionId();
          reports.push(accepted);
          return { content: [{ type: "text", text: String(accepted) }], details: undefined };
        },
      });
    } });
    h.session.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "custom" && event.message.customType === "proposal-probe") {
        events.push({ kind: "delivery", text: String(event.message.content) });
        expect(event.message.display).toBe(true);
      }
    });
    const started = h.session.prompt("Start probe");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.followUp("queued before proposal");
    await waitForSettled(h.session, async () => h.respond());
    await started;
    const sessionId = h.session.sessionManager.getSessionId();
    expect(events.find((event) => event.text === "queued before proposal")).toMatchObject({
      kind: "input", source: "interactive", session: sessionId, waiting: false,
    });
    expect(events.find((event) => event.kind === "delivery")?.text).toBe(proposal);
    expect(events.findIndex((event) => event.text === "queued before proposal")).toBeLessThan(events.findIndex((event) => event.kind === "delivery"));
    await waitForSettled(h.session, async () => sendExtensionInput());
    expect(events.find((event) => event.text === "extension approval")).toMatchObject({
      kind: "input", source: "extension", session: sessionId, waiting: true,
    });
    expect(reports).toEqual([false]);
    await waitForSettled(h.session, () => h.session.prompt("human approval", { source }));
    expect(events.find((event) => event.text === "human approval")).toMatchObject({
      kind: "input", source, session: sessionId, waiting: true,
    });
    expect(reports).toEqual([false, true]);
    expect(events.findIndex((event) => event.kind === "delivery")).toBeLessThan(events.findIndex((event) => event.text === "human approval"));
    expect(h.errors).toEqual([]);
  });
});

describe("Proposal display in the Pi 1.5.0 interactive terminal", () => {
  it("writes the complete proposal before accepting a later approval reply", async () => {
    const proposal = [
      "TERMINAL PROPOSAL BEGIN",
      "Commit plan: save the approved test change.",
      "Exact command: git commit -m 'terminal approval check'",
      "TERMINAL PROPOSAL COMPLETE",
    ].join("\n");
    const terminal = new CapturingTerminal();
    let waiting = false;
    let proposalSession = "";
    let reply: { session: string; proposalWasWritten: boolean } | undefined;
    const reports: boolean[] = [];
    const h = await setup({ terminal, script: [
      { call: { name: "terminal_proposal", arguments: {} } },
      { text: "Review the proposal and reply when ready." },
      { call: { name: "terminal_reply_report", arguments: {} } },
      { text: "The later reply was checked." },
    ], probe: (api) => {
      api.on("input", async (event, ctx) => {
        if (event.text === "Start terminal proposal") {
          api.setActiveTools(["terminal_proposal", "terminal_reply_report"]);
        }
        if (event.text === "Yes, approve") {
          const rendered = stripTerminalSequences(terminal.output).replace(/\r/g, "");
          reply = {
            session: ctx.sessionManager.getSessionId(),
            proposalWasWritten: rendered.includes("TERMINAL PROPOSAL BEGIN")
              && rendered.includes("Exact command: git commit -m 'terminal approval check'")
              && rendered.includes("TERMINAL PROPOSAL COMPLETE"),
          };
        }
        return { action: "continue" };
      });
      api.on("agent_end", async () => { waiting = true; });
      api.registerTool({
        name: "terminal_proposal", label: "Terminal proposal", description: "Render a test proposal.",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, ctx) {
          proposalSession = ctx.sessionManager.getSessionId();
          waiting = false;
          reply = undefined;
          api.sendMessage({ customType: "terminal-proposal", content: proposal, display: true }, { triggerTurn: false });
          return { content: [{ type: "text", text: "Proposal sent to the interactive host." }], details: undefined };
        },
      });
      api.registerTool({
        name: "terminal_reply_report", label: "Terminal reply report", description: "Check the later test reply.",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, ctx) {
          const accepted = waiting && reply?.proposalWasWritten === true
            && reply.session === proposalSession && proposalSession === ctx.sessionManager.getSessionId();
          reports.push(accepted);
          return { content: [{ type: "text", text: String(accepted) }], details: undefined };
        },
      });
    } });

    await waitForSettled(h.session, () => h.session.prompt("Start terminal proposal"));
    await vi.waitFor(() => {
      const rendered = stripTerminalSequences(terminal.output).replace(/\r/g, "");
      expect(rendered).toContain("TERMINAL PROPOSAL COMPLETE");
    });
    const renderedBeforeReply = stripTerminalSequences(terminal.output).replace(/\r/g, "");
    expect(renderedBeforeReply).toContain("TERMINAL PROPOSAL BEGIN");
    expect(renderedBeforeReply).toContain("Exact command: git commit -m 'terminal approval check'");
    expect(terminal.output).toMatch(/\u001b\[/);

    await waitForSettled(h.session, () => h.session.prompt("Yes, approve", { source: "interactive" }));
    expect(reply).toMatchObject({ session: h.session.sessionManager.getSessionId(), proposalWasWritten: true });
    expect(reports).toEqual([true]);
    expect(h.errors).toEqual([]);
  });
});

describe("Herald on a supported Pi host", () => {
  it("approves a multi-commit plan once and runs its exact commands", async () => {
    const replyText = "Yes, approve both commits.";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "First commit", files: ["first.txt"] },
        { message: "Second commit", files: ["second.txt"] },
      ] } } },
      { text: "Review the complete commit proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "bash", arguments: { command: "$command:1" } } },
      finishResponse,
      { text: "Both approved test commands completed. No real Git command was run." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.session.model?.id).toBe("run");
    expect(h.requests.some((request) => request.system.includes("herald_propose_commits"))).toBe(true);
    expect(h.executed).not.toHaveBeenCalled();
    await waitForSettled(h.session, () => h.session.prompt(replyText));

    const commands = h.executed.mock.calls.map(([command]) => command);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("First commit");
    expect(commands[1]).toContain("Second commit");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it.each(["github", "gitlab"] as const)("uses the selected %s request CLI with a separate chat approval", async (provider) => {
    const replyText = "Yes, push and create the request.";
    const targetBranch = provider === "github" ? "main" : "develop";
    const description = `## Summary\n\nComplete approved description.`;
    const h = await setup({ provider, script: [
      { call: { name: "herald_propose_request", arguments: {
        sourceBranch: "feature/test", targetBranch, title: "Approved request",
        description, descriptionFile: "request.md",
      } } },
      { text: "Review the full request proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "bash", arguments: { command: "$command:1" } } },
      finishResponse,
      { text: "The approved request commands completed in the fake host." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald request"));
    expect(h.requests[0].system).toContain(provider === "github" ? "gh pr list" : "glab mr list");
    expect(h.executed).not.toHaveBeenCalled();
    await waitForSettled(h.session, () => h.session.prompt(replyText));

    const commands = h.executed.mock.calls.map(([command]) => command);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("git push origin 'feature/test:feature/test'");
    expect(commands[1]).toContain(provider === "github" ? "gh pr create" : "glab mr create");
    expect(commands[1]).toContain(provider === "github" ? "--body-file 'request.md'" : "--description-file 'request.md'");
    if (provider === "gitlab") expect(commands[1]).toContain("--remove-source-branch --yes");
    expect(commands[1]).not.toContain(provider === "github" ? "glab mr create" : "gh pr create");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("requires separate commit and request approval in full mode", async () => {
    const commitReply = "Yes, approve the commit plan.";
    const requestApproval = "Yes, approve the request stage.";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "First full-mode commit", files: ["first.txt"] },
        { message: "Second full-mode commit", files: ["second.txt"] },
      ] } } },
      { text: "Review the full commit plan." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: commitReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "bash", arguments: { command: "$command:1" } } },
      { text: "Commit stage complete. Prepare the separate request proposal." },
      { call: { name: "herald_propose_request", arguments: {
        sourceBranch: "feature/test", targetBranch: "main", title: "Full-mode request",
        description: "Review the full-mode changes.",
      } } },
      { text: "Review the request proposal." },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { text: "The push was blocked because the request stage has no approval yet." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: requestApproval, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "bash", arguments: { command: "$command:1" } } },
      finishResponse,
      { text: "Full workflow finished after separate stage approvals." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald"));
    await waitForSettled(h.session, () => h.session.prompt(commitReply));
    expect(h.executed).toHaveBeenCalledTimes(2);
    expect(h.confirm).not.toHaveBeenCalled();

    await waitForSettled(h.session, () => h.session.prompt("Prepare the request stage."));
    expect(h.executed).toHaveBeenCalledTimes(2);
    await waitForSettled(h.session, () => h.session.prompt("Could you push it now?"));
    expect(h.executed).toHaveBeenCalledTimes(2);
    await waitForSettled(h.session, () => h.session.prompt(requestApproval));
    expect(h.executed).toHaveBeenCalledTimes(4);
    expect(h.executed.mock.calls[0][0]).toContain("First full-mode commit");
    expect(h.executed.mock.calls[1][0]).toContain("Second full-mode commit");
    expect(h.executed.mock.calls[2][0]).toContain("git push origin");
    expect(h.executed.mock.calls[3][0]).toContain("gh pr create");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("shows a revised proposal after a commit input check finds a change", async () => {
    const replyOne = "Approve the first proposal.";
    const replyTwo = "Approve the revised proposal.";
    const hostAdapters = adapters();
    let inputChecks = 0;
    hostAdapters.commitInputChecks.verify = async () => ++inputChecks === 1
      ? { ok: false, reason: "The approved file changed." }
      : { ok: true };
    const h = await setup({ adapterFactory: () => hostAdapters, script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "First message", files: ["file.txt"] }] } } },
      { text: "Review the proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: replyOne, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Revised message", files: ["file.txt"] }] } } },
      { text: "Review the revised proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: replyTwo, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      finishResponse,
      { text: "The revised approved command completed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(replyOne));
    expect(h.executed).not.toHaveBeenCalled();
    await waitForSettled(h.session, () => h.session.prompt(replyTwo));
    expect(inputChecks).toBe(2);
    expect(h.executed).toHaveBeenCalledOnce();
    expect(h.executed.mock.calls[0][0]).toContain("Revised message");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("requires a new proposal and chat reply before retrying a failed commit", async () => {
    const firstReply = "Approve the first commit attempt.";
    const retryReply = "Approve a new retry proposal.";
    const h = await setup({ bashOutcomes: [{ error: true, text: "Simulated commit failure." }, {}], script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "First attempt", files: ["file.txt"] }] } } },
      { text: "Review the first proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: firstReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Approved retry", files: ["file.txt"] }] } } },
      { text: "The failed attempt needs a new approval." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: retryReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      finishResponse,
      { text: "The newly approved retry completed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(firstReply));
    expect(h.executed).toHaveBeenCalledOnce();
    await waitForSettled(h.session, () => h.session.prompt(retryReply));
    expect(h.executed).toHaveBeenCalledTimes(2);
    expect(h.executed.mock.calls[0][0]).toContain("First attempt");
    expect(h.executed.mock.calls[1][0]).toContain("Approved retry");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("keeps a completed commit and asks approval only for remaining partial work", async () => {
    const firstReply = "Approve both commits.";
    const revision = "Revise the second commit message.";
    const remainingReply = "Approve the remaining commit.";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "Completed first", files: ["first.txt"] },
        { message: "Old second message", files: ["second.txt"] },
      ] } } },
      { text: "Review both commits." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: firstReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { text: "The first commit is complete." },
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "Revised second message", files: ["second.txt"] },
      ] } } },
      { text: "Review only the remaining commit." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: remainingReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      finishResponse,
      { text: "The remaining commit completed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(firstReply));
    expect(h.executed).toHaveBeenCalledOnce();
    await waitForSettled(h.session, () => h.session.prompt(revision));
    expect(h.executed).toHaveBeenCalledOnce();
    await waitForSettled(h.session, () => h.session.prompt(remainingReply));
    expect(h.executed).toHaveBeenCalledTimes(2);
    expect(h.executed.mock.calls[0][0]).toContain("Completed first");
    expect(h.executed.mock.calls[1][0]).toContain("Revised second message");
    expect(h.executed.mock.calls[0][0]).not.toBe(h.executed.mock.calls[1][0]);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("clears approval and restores the model before a session replacement", async () => {
    const replyText = "Approve the old session proposal.";
    const oldCommit = "git add -- ':(literal)src/example.ts' && git commit -m 'Add example'";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Add example", files: ["src/example.ts"] }] } } },
      { text: "Review the proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText, assessment: "unconditional-approval" } } },
      { text: "The old session proposal was approved." },
      { call: { name: "bash", arguments: { command: oldCommit } } },
      { text: "The old approval did not run in the new session." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    const oldSessionId = h.session.sessionManager.getSessionId();
    await waitForSettled(h.session, () => h.session.prompt(replyText));
    expect(h.executed).not.toHaveBeenCalled();

    await h.session.extensionRunner.emit({ type: "session_shutdown", reason: "new" });
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.getActiveToolNames()).not.toContain("herald_propose_commits");
    h.session.sessionManager.newSession();
    expect(h.session.sessionManager.getSessionId()).not.toBe(oldSessionId);
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
  });

  it("revises a proposal when its approved input changes before a commit", async () => {
    const firstReply = "Approve the first proposal.";
    const revisedReply = "Approve the revised proposal.";
    const hostAdapters = adapters();
    let inputChecks = 0;
    hostAdapters.commitInputChecks.verify = async () => ++inputChecks === 1
      ? { ok: false, reason: "The approved file changed." }
      : { ok: true };
    const h = await setup({ adapterFactory: () => hostAdapters, script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "First message", files: ["file.txt"] }] } } },
      { text: "Review the proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: firstReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Revised message", files: ["file.txt"] }] } } },
      { text: "Review the revised proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: revisedReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      finishResponse,
      { text: "The revised approved command completed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(firstReply));
    expect(h.executed).not.toHaveBeenCalled();
    await waitForSettled(h.session, () => h.session.prompt(revisedReply));
    expect(inputChecks).toBe(2);
    expect(h.executed).toHaveBeenCalledOnce();
    expect(h.executed.mock.calls[0][0]).toContain("Revised message");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("requires a new proposal and reply before retrying a failed commit", async () => {
    const firstReply = "Approve the first commit attempt.";
    const retryReply = "Approve a new retry proposal.";
    const h = await setup({ bashOutcomes: [{ error: true, text: "Simulated commit failure." }, {}], script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "First attempt", files: ["file.txt"] }] } } },
      { text: "Review the first proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: firstReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Approved retry", files: ["file.txt"] }] } } },
      { text: "The failed attempt needs a new approval." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: retryReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      finishResponse,
      { text: "The newly approved retry completed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(firstReply));
    expect(h.executed).toHaveBeenCalledOnce();
    await waitForSettled(h.session, () => h.session.prompt(retryReply));
    expect(h.executed).toHaveBeenCalledTimes(2);
    expect(h.executed.mock.calls[0][0]).toContain("First attempt");
    expect(h.executed.mock.calls[1][0]).toContain("Approved retry");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("keeps completed work and proposes only the remaining commits after a revision", async () => {
    const firstReply = "Approve both commits.";
    const revision = "Revise the second commit message.";
    const remainingReply = "Approve the remaining commit.";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "Completed first", files: ["first.txt"] },
        { message: "Old second message", files: ["second.txt"] },
      ] } } },
      { text: "Review both commits." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: firstReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { text: "The first commit is complete." },
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "Revised second message", files: ["second.txt"] },
      ] } } },
      { text: "Review only the remaining commit." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText: remainingReply, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      finishResponse,
      { text: "The remaining commit completed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(firstReply));
    expect(h.executed).toHaveBeenCalledOnce();
    await waitForSettled(h.session, () => h.session.prompt(revision));
    expect(h.executed).toHaveBeenCalledOnce();
    await waitForSettled(h.session, () => h.session.prompt(remainingReply));
    expect(h.executed).toHaveBeenCalledTimes(2);
    expect(h.executed.mock.calls[0][0]).toContain("Completed first");
    expect(h.executed.mock.calls[1][0]).toContain("Revised second message");
    expect(h.executed.mock.calls[0][0]).not.toBe(h.executed.mock.calls[1][0]);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("keeps completed commits when the user cancels the remaining work", async () => {
    const replyText = "Approve both commits.";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [
        { message: "Completed first", files: ["first.txt"] },
        { message: "Unused second", files: ["second.txt"] },
      ] } } },
      { text: "Review both commits." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText, assessment: "unconditional-approval" } } },
      { call: { name: "bash", arguments: { command: "$command:0" } } },
      { text: "The first commit completed. The second remains unused." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt(replyText));
    expect(h.executed).toHaveBeenCalledOnce();
    await h.session.prompt("/herald cancel");
    expect(h.executed).toHaveBeenCalledOnce();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.getActiveToolNames()).not.toContain("herald_propose_commits");
    expect(h.errors).toEqual([]);
  });

  it("does not reuse approval from a replaced session", async () => {
    const replyText = "Approve the old session proposal.";
    const oldCommand = "git add -- ':(literal)src/example.ts' && git commit -m 'Add example'";
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Add example", files: ["src/example.ts"] }] } } },
      { text: "Review the proposal." },
      { call: { name: "herald_report_reply", arguments: { proposalId: "$proposalId", replyText, assessment: "unconditional-approval" } } },
      { text: "The old session proposal was approved." },
      { call: { name: "bash", arguments: { command: oldCommand } } },
      { text: "The old approval did not run in the new session." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    const oldSessionId = h.session.sessionManager.getSessionId();
    await waitForSettled(h.session, () => h.session.prompt(replyText));
    expect(h.executed).not.toHaveBeenCalled();

    h.session.sessionManager.newSession();
    expect(h.session.sessionManager.getSessionId()).not.toBe(oldSessionId);
    await waitForSettled(h.session, () => h.session.prompt("Try the old command again."));
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    await h.session.extensionRunner.emit({ type: "session_shutdown", reason: "new" });
    expect(h.session.getActiveToolNames()).not.toContain("herald_propose_commits");
    expect(h.errors).toEqual([]);
  });

  it("blocks a detected command without a stage proposal and does not show a dialog", async () => {
    const h = await setup({ approve: false, script: [
      { text: "Approve the commit plan?" },
      { call: { name: "bash", arguments: { command: "git commit -m approved" } } },
      { text: "The command was denied. Should I revise the plan?" },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt("Yes, commit."));
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("run");
    await h.session.prompt("/herald cancel");
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("cancels while waiting for proposal approval", async () => {
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Cancel me", files: ["file.txt"] }] } } },
      { text: "Review the commit proposal." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.session.model?.id).toBe("run");
    expect(h.session.getActiveToolNames()).toContain("herald_propose_commits");
    await h.session.prompt("/herald cancel");
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(h.session.getActiveToolNames()).not.toContain("herald_propose_commits");
    expect(h.session.getActiveToolNames()).not.toContain("herald_report_reply");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it("restores after a terminal provider error without a finish call", async () => {
    const h = await setup({ script: [{ error: "Terminal local test failure" }] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(h.errors).toEqual([]);
  });

  it.each(["model", "thinking"])("preserves manual %s across the approval reply", async (choice) => {
    const h = await setup({ delayEvents: true, script: [
      { text: "Approve this plan?" }, finishResponse, { text: "Final summary." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    if (choice === "model") await h.session.setModel(h.runtime.getModel("herald-test", "manual")!);
    else h.session.setThinkingLevel("minimal");
    await waitForSettled(h.session, () => h.session.prompt("Yes, proceed."));
    expect(h.requests[1]).toMatchObject(choice === "model" ? { model: "manual", thinking: "medium" } : { model: "run", thinking: "minimal" });
    expect(h.session.model?.id).toBe(choice === "model" ? "manual" : "chat");
    expect(h.session.thinkingLevel).toBe(choice === "model" ? "medium" : "minimal");
    expect(h.errors).toEqual([]);
  });

  it("cleans up a pending proposal before reload", async () => {
    const h = await setup({ script: [
      { call: { name: "herald_propose_commits", arguments: { commits: [{ message: "Reload me", files: ["file.txt"] }] } } },
      { text: "Review the proposal before reload." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await h.session.reload();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(h.session.getActiveToolNames()).not.toContain("herald_propose_commits");
    expect(h.session.getActiveToolNames()).not.toContain("herald_report_reply");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it("uses and restores selections without changing file settings", async () => {
    const h = await setup({ delayEvents: true });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.errors).toEqual([]);
    expect(JSON.stringify(h.session.messages)).toContain("Herald result recorded");
    expect(h.requests).toHaveLength(2);
    expect(h.requests).toEqual(expect.arrayContaining([expect.objectContaining({ model: "run", thinking: "low" })]));
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it("preserves manual thinking with delayed selection events", async () => {
    const h = await setup({ hold: true, delayEvents: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    h.session.setThinkingLevel("minimal");
    await waitForSettled(h.session, async () => h.respond());
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("minimal");
    expect(h.errors).toEqual([]);
  });

  it("preserves thinking changed away and back before delayed events arrive", async () => {
    const h = await setup({ hold: true, delayEvents: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    h.session.setThinkingLevel("high");
    h.session.setThinkingLevel("low");
    await waitForSettled(h.session, async () => h.respond());
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("low");
    expect(h.errors).toEqual([]);
  });

  it("preserves a manual model choice", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.setModel(h.runtime.getModel("herald-test", "manual")!);
    await waitForSettled(h.session, async () => h.respond());
    expect(h.session.model?.id).toBe("manual");
    expect(h.session.thinkingLevel).toBe("medium");
    expect(h.errors).toEqual([]);
  });

  it("cancels a streaming workflow through the Herald command", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.prompt("/herald cancel");
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
  });

  it("restores selections on cancellation", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.abort();
    await h.session.waitForIdle();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.errors).toEqual([]);
  });

  it("restores before the extension runtime is replaced on reload", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.reload();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    h.respond();
    await h.session.waitForIdle();
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });
});
