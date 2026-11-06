import { describe, expect, it, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerGitIntegration } from "../src/interface/pi/extension.js";
import type { HeraldAdapters } from "../src/interface/pi/extension.js";
import { createPiHarness } from "./helpers/pi-harness.js";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function fakeAdapters(): HeraldAdapters {
  return {
    git: {
      isRepository: vi.fn(async () => true),
      originUrl: vi.fn(async () => "https://github.com/owner/repo.git"),
      snapshot: vi.fn(async () => ({
        branch: "feature/example",
        status: "",
        stagedDiff: "",
        unstagedDiff: "",
        recentCommits: "abc123 Commit",
      })),
      refExists: vi.fn(async () => false),
      diffAgainst: vi.fn(async () => ""),
    },
    hosting: {
      resolve: vi.fn(async () => "github"),
      defaultBranch: vi.fn(async () => "main"),
    },
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
    requestInputChecks: (provider) => ({
      prepare: async (draft) => {
        const descriptionArg = draft.descriptionInput.kind === "file"
          ? provider === "github" ? `--body-file ${shellQuote(draft.descriptionInput.path)}` : `--description-file ${shellQuote(draft.descriptionInput.path)}`
          : provider === "github" ? `--body ${shellQuote(draft.description)}` : `--description ${shellQuote(draft.description)}`;
        const pushAlreadyCompleted = draft.pushAlreadyCompleted ?? false;
        const commands = pushAlreadyCompleted ? [] : [{
          action: "push" as const,
          command: `git push origin ${shellQuote(`${draft.sourceBranch}:${draft.sourceBranch}`)}`,
          inputSnapshot: "push-test-snapshot",
        }];
        commands.push({
          action: "create" as const,
          command: provider === "github"
            ? `gh pr create --base ${shellQuote(draft.targetBranch)} --head ${shellQuote(draft.sourceBranch)} --title ${shellQuote(draft.title)} ${descriptionArg}`
            : `glab mr create --source-branch ${shellQuote(draft.sourceBranch)} --target-branch ${shellQuote(draft.targetBranch)} --title ${shellQuote(draft.title)} ${descriptionArg} --remove-source-branch --yes`,
          inputSnapshot: "request-test-snapshot",
        });
        return { ok: true, proposal: { ...draft, pushAlreadyCompleted, commands } };
      },
      verify: async () => ({ ok: true }),
    }),
  };
}

type ApprovalHarness = ReturnType<typeof createPiHarness> & { adapters: HeraldAdapters };

function createHarness() {
  const h = createPiHarness();
  const adapters = fakeAdapters();
  let callId = 0;
  registerGitIntegration(h.api, () => adapters);
  return {
    ...h,
    adapters,
    start: (mode: string) => h.start(mode === "full" ? "" : mode),
    callTool: (command: string, ctx: any = h.ctx, toolCallId = `bash-${++callId}`) => h.emit("tool_call", {
      toolCallId, toolName: "bash", input: { command },
    }, ctx),
  };
}

async function approveCommitProposal(h: ApprovalHarness) {
  const draft = { stage: "commit" as const, commits: [{ message: "Add example", files: ["src/example.ts"] }] };
  const prepared = await h.adapters.commitInputChecks.prepare(draft);
  if (!prepared.ok) throw new Error(prepared.reason);
  const result = await h.tools.get("herald_propose_commits").execute("proposal", { commits: draft.commits }, undefined, undefined, h.ctx);
  if (result.isError) throw new Error(String(result.content?.[0]?.text ?? "Commit proposal failed"));
  await h.emit("agent_settled", { aborted: false });
  const replyText = "Yes, approve the proposal.";
  await h.emit("input", { text: replyText, source: "interactive" });
  const report = await h.tools.get("herald_report_reply").execute("report", {
    proposalId: result.details.proposalId, replyText, assessment: "unconditional-approval",
  }, undefined, undefined, h.ctx);
  if (report.isError || !report.details?.approved) throw new Error(String(report.content?.[0]?.text ?? "Reply was not approved"));
  return { proposalId: result.details.proposalId as string, proposal: prepared.proposal };
}

async function approveRequestProposal(h: ApprovalHarness, pushAlreadyCompleted = false) {
  const draft = {
    stage: "request" as const,
    provider: "github" as const,
    sourceBranch: "feature/example",
    targetBranch: "main",
    title: "Add example",
    description: "Review the example change.",
    descriptionInput: { kind: "inline" as const },
    pushAlreadyCompleted,
  };
  const checks = h.adapters.requestInputChecks("github");
  const prepared = await checks.prepare(draft);
  if (!prepared.ok) throw new Error(prepared.reason);
  const result = await h.tools.get("herald_propose_request").execute("request-proposal", {
    sourceBranch: draft.sourceBranch, targetBranch: draft.targetBranch, title: draft.title, description: draft.description,
  }, undefined, undefined, h.ctx);
  if (result.isError) throw new Error(String(result.content?.[0]?.text ?? "Request proposal failed"));
  await h.emit("agent_settled", { aborted: false });
  const replyText = "Yes, approve the request proposal.";
  await h.emit("input", { text: replyText, source: "interactive" });
  const report = await h.tools.get("herald_report_reply").execute("request-report", {
    proposalId: result.details.proposalId, replyText, assessment: "unconditional-approval",
  }, undefined, undefined, h.ctx);
  if (report.isError || !report.details?.approved) throw new Error(String(report.content?.[0]?.text ?? "Reply was not approved"));
  return { proposalId: result.details.proposalId as string, proposal: prepared.proposal };
}

describe("Pi Git integration adapter", () => {
  it("blocks actions that are not allowed by the active mode", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const confirm = vi.fn(async () => true);

    const result = await harness.callTool("git push origin HEAD", { hasUI: true, ui: { confirm } });

    expect(result).toMatchObject({ block: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    { mode: "commit", action: "commit", allowed: true },
    { mode: "commit", action: "push", allowed: false },
    { mode: "commit", action: "create", allowed: false },
    { mode: "request", action: "commit", allowed: false },
    { mode: "request", action: "push", allowed: true },
    { mode: "request", action: "create", allowed: true },
    { mode: "full", action: "commit", allowed: true },
    { mode: "full", action: "push", allowed: true },
    { mode: "full", action: "create", allowed: true },
  ] as const)("$mode mode checks the approved $action command without a dialog", async ({ mode, action, allowed }) => {
    const harness = createHarness();
    await harness.start(mode);
    let command = action === "commit" ? "git commit -m unapproved"
      : action === "push" ? "git push origin HEAD"
        : "gh pr create --title unapproved";

    if (allowed && action === "commit") {
      const prepared = await approveCommitProposal(harness);
      command = prepared.proposal.commits[0].command;
    } else if (allowed) {
      const prepared = await approveRequestProposal(harness);
      if (action === "push") {
        command = prepared.proposal.commands.find((item) => item.action === "push")!.command;
      } else {
        const push = prepared.proposal.commands.find((item) => item.action === "push");
        if (push) {
          const pushId = `push-before-create-${mode}`;
          expect(await harness.callTool(push.command, harness.ctx, pushId)).toBeUndefined();
          await harness.emit("tool_execution_end", { toolCallId: pushId, toolName: "bash", isError: false, result: {} });
        }
        command = prepared.proposal.commands.find((item) => item.action === "create")!.command;
      }
    }

    const callId = `matrix-${mode}-${action}`;
    const result = await harness.callTool(command, harness.ctx, callId);
    if (!allowed) {
      expect(result).toMatchObject({ block: true });
    } else {
      expect(result).toBeUndefined();
      await harness.emit("tool_execution_end", { toolCallId: callId, toolName: "bash", isError: false, result: {} });
    }
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("blocks mixed and non-matching commands after a proposal is approved", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const prepared = await approveCommitProposal(harness);
    const exact = prepared.proposal.commits[0].command;

    expect(await harness.callTool(`${exact} && git push origin HEAD`)).toMatchObject({ block: true });
    expect(await harness.callTool("git commit -m a different message")).toMatchObject({ block: true });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("blocks an approved command when no user interface is available", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const prepared = await approveCommitProposal(harness);
    const result = await harness.callTool(prepared.proposal.commits[0].command, { ...harness.ctx, hasUI: false });
    expect(result).toMatchObject({ block: true });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("blocks changed inputs before dispatch and does not retry the same attempt", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const prepared = await approveCommitProposal(harness);
    const verify = vi.fn(async () => ({ ok: false as const, reason: "The approved file changed." }));
    harness.adapters.commitInputChecks.verify = verify;

    const result = await harness.callTool(prepared.proposal.commits[0].command);
    expect(result).toMatchObject({ block: true, reason: "The approved file changed." });
    expect(verify).toHaveBeenCalledOnce();
    expect(await harness.callTool(prepared.proposal.commits[0].command)).toMatchObject({ block: true });
    expect(verify).toHaveBeenCalledOnce();
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("reserves one command attempt and blocks parallel or repeated calls", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const prepared = await approveCommitProposal(harness);
    let release!: (result: { ok: true }) => void;
    const verify = vi.fn(() => new Promise<{ ok: true }>((resolve) => { release = resolve; }));
    harness.adapters.commitInputChecks.verify = verify;

    const firstCall = harness.callTool(prepared.proposal.commits[0].command, harness.ctx, "parallel-first");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(harness.callTool(prepared.proposal.commits[0].command, harness.ctx, "parallel-second"))
      .resolves.toMatchObject({ block: true });
    release({ ok: true });
    await expect(firstCall).resolves.toBeUndefined();
    await harness.emit("tool_execution_end", {
      toolCallId: "parallel-first", toolName: "bash", isError: false, result: {},
    });
    await expect(harness.callTool(prepared.proposal.commits[0].command, harness.ctx, "repeat"))
      .resolves.toMatchObject({ block: true });
    expect(verify).toHaveBeenCalledOnce();
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("requires request-stage approval, blocks a failed push retry, and keeps the terminal failure", async () => {
    const harness = createHarness();
    await harness.start("request");
    const prepared = await approveRequestProposal(harness);
    const push = prepared.proposal.commands.find((command) => command.action === "push")!;
    const result = await harness.callTool(push.command, harness.ctx, "failed-push");
    expect(result).toBeUndefined();
    await harness.emit("tool_execution_end", {
      toolCallId: "failed-push", toolName: "bash", isError: true, result: { content: [{ type: "text", text: "push failed" }] },
    });
    expect(await harness.callTool(push.command, harness.ctx, "push-retry")).toMatchObject({ block: true });
    expect(await harness.callTool(prepared.proposal.commands.find((command) => command.action === "create")!.command))
      .toMatchObject({ block: true, reason: expect.stringContaining("result") });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("does not repeat a successful push when a revised request proposal is made", async () => {
    const harness = createHarness();
    await harness.start("full");
    const first = await approveRequestProposal(harness);
    const push = first.proposal.commands.find((command) => command.action === "push")!;
    expect(await harness.callTool(push.command, harness.ctx, "push-once")).toBeUndefined();
    await harness.emit("tool_execution_end", {
      toolCallId: "push-once", toolName: "bash", isError: false, result: {},
    });

    await harness.emit("input", { text: "Change the request title.", source: "interactive" });
    const revised = await harness.tools.get("herald_propose_request").execute("revised-request", {
      sourceBranch: "feature/example", targetBranch: "main", title: "Revised title",
      description: "Review the revised change.",
    }, undefined, undefined, harness.ctx);
    expect(revised.isError).toBeUndefined();
    expect(harness.api.sendMessage.mock.calls.at(-1)?.[0].content).not.toContain("git push origin");
    await harness.emit("agent_settled", { aborted: false });
    const replyText = "Yes, create the revised request.";
    await harness.emit("input", { text: replyText, source: "interactive" });
    const report = await harness.tools.get("herald_report_reply").execute("revised-report", {
      proposalId: revised.details.proposalId, replyText, assessment: "unconditional-approval",
    }, undefined, undefined, harness.ctx);
    expect(report.details).toMatchObject({ approved: true });

    const create = revised.details.commands[0] as string;
    expect(revised.content[0].text).toContain(create);
    expect(await harness.callTool(create, harness.ctx, "create-only")).toBeUndefined();
    await harness.emit("tool_execution_end", {
      toolCallId: "create-only", toolName: "bash", isError: false, result: {},
    });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("ignores a late tool result after cancellation and does not carry its approval into a new run", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const prepared = await approveCommitProposal(harness);
    const command = prepared.proposal.commits[0].command;
    const toolCallId = "late-result";
    expect(await harness.callTool(command, harness.ctx, toolCallId)).toBeUndefined();
    await harness.start("cancel");
    await harness.emit("tool_execution_end", { toolCallId, toolName: "bash", isError: false, result: {} });

    await harness.start("commit");
    expect(await harness.callTool(command)).toMatchObject({ block: true });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("blocks a detected action from a stale session", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const prepared = await approveCommitProposal(harness);
    const wrongSession = { ...harness.ctx, sessionManager: { getSessionId: () => "replacement-session" } };
    expect(await harness.callTool(prepared.proposal.commits[0].command, wrongSession)).toMatchObject({ block: true });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("does not carry the mode or provider past explicit workflow completion", async () => {
    const harness = createHarness();
    await harness.start("full");
    await harness.finish();
    await harness.emit("agent_settled", { aborted: false });
    const confirm = vi.fn(async () => true);

    const result = await harness.callTool("glab mr create --title test", { hasUI: true, ui: { confirm } });

    expect(result).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("registers the command and starts a prepared agent turn", async () => {
    const { api, commands, ctx } = createPiHarness();
    const adapters = fakeAdapters();
    const notify = vi.fn();

    registerGitIntegration(api, (cwd) => {
      expect(cwd).toBe("/worktree");
      return adapters;
    });

    await commands.get("herald")!.handler("commit", {
      ...ctx,
      ui: { ...ctx.ui, notify },
    } as unknown as ExtensionCommandContext);

    expect(notify).toHaveBeenCalledWith("Herald — commit mode", "info");
    expect(api.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("## Git Integration — commit mode"));
    expect(adapters.hosting.resolve).not.toHaveBeenCalled();
  });

  it("blocks a detected command without chat approval and never opens a dialog", async () => {
    const harness = createHarness();
    await harness.start("commit");

    const result = await harness.callTool("git commit -m test");

    expect(result).toMatchObject({ block: true, reason: expect.stringContaining("no current approved proposal") });
    expect(harness.ctx.ui.confirm).not.toHaveBeenCalled();
  });
});

describe("Herald proposal and reply tools", () => {
  it("activates only mode-allowed proposal tools and removes only tools it owns", async () => {
    const h = createHarness();
    expect(h.tools.has("herald_propose_commits")).toBe(true);
    expect(h.api.getActiveTools()).not.toContain("herald_propose_commits");
    await h.start("commit");
    expect(h.api.getActiveTools()).toContain("herald_propose_commits");
    expect(h.api.getActiveTools()).toContain("herald_report_reply");
    expect(h.api.getActiveTools()).not.toContain("herald_propose_request");

    await h.finish();
    await h.emit("agent_settled", { aborted: false });
    expect(h.api.getActiveTools()).toEqual(["read", "bash"]);
  });

  it("shows a commit proposal and binds approval to a later human reply", async () => {
    const h = createHarness();
    await h.start("commit");
    const propose = h.tools.get("herald_propose_commits");
    const report = h.tools.get("herald_report_reply");
    const args = { commits: [{ message: "Add example", files: ["src/example.ts"] }] };
    const proposalResult = await propose.execute("proposal-call", args, undefined, undefined, h.ctx);
    const proposalId = proposalResult.details.proposalId as string;
    const shown = h.api.sendMessage.mock.calls[0][0];
    expect(shown).toMatchObject({ customType: "herald-proposal", display: true });
    expect(shown.content).toContain(proposalId);
    expect(shown.content).toContain("src/example.ts");
    expect(shown.content).toContain("git commit -m 'Add example'");

    await h.emit("input", { text: "queued before display", source: "interactive", streamingBehavior: "followUp" });
    await expect(report.execute("early-report", {
      proposalId, replyText: "queued before display", assessment: "unconditional-approval",
    }, undefined, undefined, h.ctx)).resolves.toMatchObject({ isError: true });
    await h.emit("agent_settled", { aborted: false });
    await h.emit("input", { text: "extension message", source: "extension" });
    await expect(report.execute("extension-report", {
      proposalId, replyText: "extension message", assessment: "unconditional-approval",
    }, undefined, undefined, h.ctx)).resolves.toMatchObject({ isError: true });

    await h.emit("input", { text: "Maybe, if the tests pass.", source: "interactive" });
    const conditional = await report.execute("conditional-report", {
      proposalId, replyText: "Maybe, if the tests pass.", assessment: "conditional",
    }, undefined, undefined, h.ctx);
    expect(conditional.details).toMatchObject({ approved: false });
    await expect(report.execute("repeat-report", {
      proposalId, replyText: "Maybe, if the tests pass.", assessment: "unconditional-approval",
    }, undefined, undefined, h.ctx)).resolves.toMatchObject({ isError: true });

    await h.emit("input", { text: "Yes, approve the proposal.", source: "rpc" });
    const approved = await report.execute("approval-report", {
      proposalId, replyText: "Yes, approve the proposal.", assessment: "unconditional-approval",
    }, undefined, undefined, h.ctx);
    expect(approved.details).toMatchObject({ proposalId, approved: true });
    expect(h.ctx.sessionManager.getSessionId()).toBe("session-1");
  });

  it("prepares and displays a review-request proposal with its complete description", async () => {
    const h = createHarness();
    await h.start("request");
    const propose = h.tools.get("herald_propose_request");
    const description = `## Summary

Complete approved description.`;
    const result = await propose.execute("request-proposal", {
      sourceBranch: "feature/example", targetBranch: "main", title: "Add example", description,
      descriptionFile: "request.md",
    }, undefined, undefined, h.ctx);
    expect(result.isError).toBeUndefined();
    expect(h.api.sendMessage).toHaveBeenCalledOnce();
    const shown = h.api.sendMessage.mock.calls[0][0];
    expect(shown.content).toContain(description);
    expect(shown.content).toContain("git push origin");
    expect(shown.content).toContain("gh pr create");
    expect(shown.content).toContain("--body-file 'request.md'");
  });

  it.each(["denial", "conditional", "unclear"] as const)("does not approve a %s reply assessment", async (assessment) => {
    const h = createHarness();
    await h.start("commit");
    const proposal = await h.tools.get("herald_propose_commits").execute("proposal", {
      commits: [{ message: "Add example", files: ["src/example.ts"] }],
    }, undefined, undefined, h.ctx);
    const proposalId = proposal.details.proposalId as string;
    await h.emit("agent_settled", { aborted: false });
    await h.emit("input", { text: "A non-approval reply.", source: "interactive" });

    const result = await h.tools.get("herald_report_reply").execute("report", {
      proposalId, replyText: "A non-approval reply.", assessment,
    }, undefined, undefined, h.ctx);
    expect(result.details).toMatchObject({ approved: false });
  });

  it("rejects invalid proposals, stale proposal reports, and wrong-session tool calls", async () => {
    const h = createHarness();
    await h.start("commit");
    const propose = h.tools.get("herald_propose_commits");
    const report = h.tools.get("herald_report_reply");
    await expect(propose.execute("invalid", { commits: [] }, undefined, undefined, h.ctx))
      .resolves.toMatchObject({ isError: true });
    expect(h.api.sendMessage).not.toHaveBeenCalled();

    const first = await propose.execute("proposal-1", {
      commits: [{ message: "Add example", files: ["src/example.ts"] }],
    }, undefined, undefined, h.ctx);
    const firstId = first.details.proposalId as string;
    await h.emit("agent_settled", { aborted: false });
    const replacement = await propose.execute("proposal-2", {
      commits: [{ message: "Improve example", files: ["src/example.ts"] }],
    }, undefined, undefined, h.ctx);
    const replacementId = replacement.details.proposalId as string;
    await h.emit("agent_settled", { aborted: false });
    await h.emit("input", { text: "Yes, approve the revised proposal.", source: "interactive" });
    await expect(report.execute("stale", {
      proposalId: firstId, replyText: "Yes, approve the revised proposal.", assessment: "unconditional-approval",
    }, undefined, undefined, h.ctx)).resolves.toMatchObject({ isError: true });

    const wrongSession = { ...h.ctx, sessionManager: { getSessionId: () => "other-session" } };
    await expect(report.execute("wrong-session", {
      proposalId: replacementId, replyText: "Yes, approve the revised proposal.", assessment: "unconditional-approval",
    }, undefined, undefined, wrongSession)).resolves.toMatchObject({ isError: true });
  });
});

function configuredHarness() {
  const harness = createPiHarness();
  const adapters = fakeAdapters();
  let herald: unknown = { model: "test/herald", thinkingLevel: "low" };
  const settings = { read: vi.fn(async () => ({
    sources: [{ path: "/project/.pi/settings.json", value: { herald } }], problems: [],
  })) };
  const withAdapters = Object.assign(harness, { adapters });
  registerGitIntegration(withAdapters.api, () => adapters, settings);
  return { harness: withAdapters, adapters, settings, configure: (value: unknown) => { herald = value; } };
}

describe("Herald workflow approval", () => {
  it.each(["completed", "failed", "cancelled"])("blocks mutations after result %s until settlement", async (status) => {
    const { harness: h } = configuredHarness();
    await h.start();
    await h.finish(status);
    await h.finish(status);
    expect(h.model).toBe(h.herald);
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git commit -m test" } })).toMatchObject({ block: true });
    expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git status" } })).toBeUndefined();
    await h.emit("agent_settled");
    await h.emit("agent_settled");
    expect(h.model).toBe(h.chat);
    expect(h.setModel).toHaveBeenCalledTimes(2);
  });

  it("rejects inactive and wrong-session finish calls", async () => {
    const { harness: h } = configuredHarness();
    expect(await h.finish()).toMatchObject({ isError: true });
    await h.start();
    const wrong = { ...h.ctx, sessionManager: { getSessionId: () => "other" } };
    expect(await h.finish("completed", wrong)).toMatchObject({ isError: true });
    await h.emit("agent_settled");
    expect(h.model).toBe(h.herald);
  });

  it.each([false, true])("does not grant command access from a chat reply without a proposal, configured: %s", async (configured) => {
    const setup = configuredHarness();
    const h = setup.harness;
    if (!configured) setup.configure({});
    await h.start("");
    await h.emit("agent_settled");
    await h.emit("input", { text: "Yes, proceed.", source: "interactive" });
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git commit -m test" } })).toMatchObject({ block: true });
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git push origin HEAD" } })).toMatchObject({ block: true });
    expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("retains full mode through the later request approval", async () => {
    const { harness: h, settings } = configuredHarness();
    await h.start("");
    for (const prompt of ["Revise the commit message", "Commit it", "Revise the request", "Push and create it"]) {
      await h.emit("agent_settled");
      expect(h.model).toBe(h.herald);
      expect(await h.emit("before_agent_start", { systemPrompt: "original", prompt })).toMatchObject({ systemPrompt: expect.stringContaining("Git Integration") });
    }
    expect(settings.read).toHaveBeenCalledOnce();
    expect(h.ctx.ui.setStatus).toHaveBeenCalledWith("herald", expect.stringContaining("full"));
    await h.start("commit");
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("/herald cancel"), "warning");
    await h.finish();
    await h.emit("agent_settled");
    expect(h.model).toBe(h.chat);
  });
});

describe("Herald cancellation", () => {
  it("leaves a waiting workflow and permits a new start", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    await h.emit("agent_settled");
    await h.start("cancel");
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    expect(h.ctx.abort).not.toHaveBeenCalled();
    expect(h.api.getActiveTools()).not.toContain("herald_finish");
    expect(await h.emit("before_agent_start", { systemPrompt: "original" })).toBeUndefined();
    await h.start();
    expect(h.model).toBe(h.herald);
  });

  it("does not abort unrelated activity when no workflow is active", async () => {
    const { harness: h, settings } = configuredHarness();
    vi.mocked(h.ctx.isIdle).mockReturnValue(false);
    await h.start("cancel");
    expect(h.ctx.abort).not.toHaveBeenCalled();
    expect(settings.read).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("No Herald workflow"), "info");
  });

  it("aborts streaming and serializes cancellation until idle", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    vi.mocked(h.ctx.isIdle).mockReturnValue(false);
    let release!: () => void;
    h.ctx.waitForIdle = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = h.start("cancel");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const second = h.start("cancel");
    await h.start();
    expect(h.ctx.abort).toHaveBeenCalledOnce();
    expect(h.model).toBe(h.herald);
    release();
    await Promise.all([first, second]);
    expect(h.model).toBe(h.chat);
    expect(h.setModel).toHaveBeenCalledTimes(2);
  });

  it.each(["preparation", "selection"])("invalidates a start during %s", async (phase) => {
    const { harness: h, adapters } = configuredHarness();
    let release!: () => void;
    if (phase === "preparation") {
      const original = adapters.git.snapshot;
      adapters.git.snapshot = async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        adapters.git.snapshot = original;
        return original();
      };
    } else {
      const original = h.setModel.getMockImplementation()!;
      h.setModel.mockImplementationOnce(async (model) => {
        await new Promise<void>((resolve) => { release = resolve; });
        return original(model);
      });
    }
    const starting = h.start();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const cancel = h.start("cancel");
    release();
    await Promise.all([starting, cancel]);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
    expect(h.api.getActiveTools()).not.toContain("herald_finish");
    await h.start();
    expect(h.model).toBe(h.herald);
  });

  it("rejects extra cancellation arguments", async () => {
    const { harness: h } = configuredHarness();
    await h.start("cancel now");
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("/herald cancel"), "error");
    expect(h.ctx.abort).not.toHaveBeenCalled();
  });

  it("does not dispatch a command when its input check finishes after cancellation", async () => {
    const { harness: h, adapters } = configuredHarness();
    await h.start();
    const prepared = await approveCommitProposal(h);
    let release!: (result: { ok: true } | { ok: false; reason: string }) => void;
    adapters.commitInputChecks.verify = () => new Promise((resolve) => { release = resolve; });
    const toolCallId = "late-input-check";
    const command = h.emit("tool_call", {
      toolCallId, toolName: "bash", input: { command: prepared.proposal.commits[0].command },
    });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await h.start("cancel");
    release({ ok: true });
    expect(await command).toMatchObject({ block: true });
    expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
  });
});

describe("Herald final outcomes", () => {
  it.each(["error", "aborted"])("restores after terminal outcome %s", async (outcome) => {
    const { harness: h } = configuredHarness();
    await h.start();
    await h.emit("agent_before_settle", { outcome });
    expect(h.model).toBe(h.herald);
    await h.emit("agent_settled", { aborted: outcome === "aborted" });
    expect(h.model).toBe(h.chat);
    expect(h.api.getActiveTools()).not.toContain("herald_finish");
    expect(h.ctx.ui.setStatus).toHaveBeenLastCalledWith("herald", undefined);
  });

  it("keeps a recovered run and recoverable tool errors active", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    await h.emit("agent_end", { messages: [{ role: "assistant", stopReason: "error" }] });
    await h.emit("agent_before_settle", { outcome: "error" });
    await h.emit("agent_before_settle", { outcome: "completed" });
    await h.emit("agent_settled");
    expect(h.model).toBe(h.herald);
    await h.emit("before_agent_start", { systemPrompt: "reply" });
    await h.emit("tool_result", { toolName: "bash", isError: true });
    await h.emit("agent_before_settle", { outcome: "completed" });
    await h.emit("agent_settled");
    expect(h.model).toBe(h.herald);
    await h.finish("failed");
    await h.emit("agent_settled");
    expect(h.model).toBe(h.chat);
  });

  it.each(["model", "thinking", "thinking-away-and-back"])("preserves manual %s across replies and delayed events", async (choice) => {
    const { harness: h } = configuredHarness();
    h.delayThinkingEvents();
    await h.start();
    await h.emit("agent_settled");
    if (choice === "model") await h.setModel(h.manual);
    else {
      h.setThinkingLevel("minimal");
      if (choice === "thinking-away-and-back") h.setThinkingLevel("low");
    }
    await h.emit("before_agent_start", { systemPrompt: "original", prompt: "Yes" });
    await h.finish();
    await h.emit("agent_before_settle", { outcome: "completed" });
    await h.emit("agent_settled");
    await h.flushThinkingEvents();
    expect(h.model).toBe(choice === "model" ? h.manual : h.chat);
    expect(h.thinking).toBe(choice === "model" ? "medium" : choice === "thinking" ? "minimal" : "low");
  });
});

describe("Herald settings lifecycle", () => {
  it("keeps Herald selections and instructions while using a chat-approved proposal", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    const first = await h.emit("before_agent_start", { systemPrompt: "original" });
    expect(first.systemPrompt).toContain("herald_propose_commits");
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");

    const prepared = await approveCommitProposal(h);
    const reply = await h.emit("before_agent_start", { systemPrompt: "original", prompt: "Yes, commit it." });
    expect(reply).toEqual(first);
    const toolCallId = "settings-approved-commit";
    expect(await h.emit("tool_call", {
      toolCallId, toolName: "bash", input: { command: prepared.proposal.commits[0].command },
    })).toBeUndefined();
    await h.emit("tool_execution_end", { toolCallId, toolName: "bash", isError: false, result: {} });
    expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it.each(["", "commit", "request"])("applies and restores selections for mode %j", async (mode) => {
    const { harness: h } = configuredHarness();
    await h.start(mode);
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");
    expect(h.api.sendUserMessage).toHaveBeenCalledOnce();
    await h.emit("agent_end");
    expect(h.model).toBe(h.herald);
    await h.emit("agent_settled", { aborted: false });
    expect(h.model).toBe(h.herald);
    await h.emit("before_agent_start", { systemPrompt: "reply", prompt: "Yes" });
    await h.finish();
    expect(h.model).toBe(h.herald);
    await h.emit("agent_settled", { aborted: false });
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
  });

  it.each(["settled", "cancelled", "reload", "new", "resume", "fork", "quit"])("cleans up on %s", async (boundary) => {
    const { harness: h } = configuredHarness();
    await h.start();
    if (boundary === "settled" || boundary === "cancelled") {
      if (boundary === "settled") await h.finish();
      await h.emit("agent_settled", { aborted: boundary === "cancelled" });
    } else {
      await h.emit("session_shutdown", { reason: boundary });
    }
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    expect(await h.emit("before_agent_start", { systemPrompt: "original" })).toBeUndefined();
  });

  it.each([false, true])("preserves unrelated tools and prior finish activation: %s", async (alreadyActive) => {
    const { harness: h } = configuredHarness();
    if (alreadyActive) h.api.setActiveTools(["read", "bash", "herald_finish"]);
    await h.start();
    expect(h.api.getActiveTools()).toContain("herald_finish");
    h.api.setActiveTools([...h.api.getActiveTools().filter((name) => name !== "read"), "custom"]);
    await h.finish();
    await h.emit("agent_settled");
    expect(h.api.getActiveTools()).toEqual(alreadyActive ? ["bash", "herald_finish", "custom"] : ["bash", "custom"]);
    expect(await h.emit("before_agent_start", { systemPrompt: "unrelated" })).toBeUndefined();
    expect(h.ctx.ui.setStatus).toHaveBeenLastCalledWith("herald", undefined);
  });

  it("reads new settings only on the next run", async () => {
    const { harness: h, settings, configure } = configuredHarness();
    await h.start();
    configure({ model: "test/manual", thinkingLevel: "xhigh" });
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");
    expect(settings.read).toHaveBeenCalledOnce();
    await h.finish();
    await h.emit("agent_settled");
    await h.start();
    expect(h.model).toBe(h.manual);
    expect(h.thinking).toBe("xhigh");
    expect(settings.read).toHaveBeenCalledTimes(2);
  });

  it("keeps mode limits while using a configured model", async () => {
    const { harness: h } = configuredHarness();
    await h.start("commit");
    const prepared = await approveCommitProposal(h);
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git push origin HEAD" } })).toMatchObject({ block: true });
    const toolCallId = "configured-approved-commit";
    expect(await h.emit("tool_call", {
      toolCallId, toolName: "bash", input: { command: prepared.proposal.commits[0].command },
    })).toBeUndefined();
    await h.emit("tool_execution_end", { toolCallId, toolName: "bash", isError: false, result: {} });
    expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("prevents overlapping active runs", async () => {
    const { harness: h, settings } = configuredHarness();
    await h.start();
    await h.start();
    expect(settings.read).toHaveBeenCalledOnce();
    expect(h.api.sendUserMessage).toHaveBeenCalledOnce();
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("already running"), "warning");
  });

  it("prevents overlapping starts while waiting for idle", async () => {
    const { harness: h, settings } = configuredHarness();
    let release!: () => void;
    h.ctx.waitForIdle = () => new Promise<void>((resolve) => { release = resolve; });
    const first = h.start();
    await h.start();
    expect(settings.read).not.toHaveBeenCalled();
    release();
    await first;
    expect(h.api.sendUserMessage).toHaveBeenCalledOnce();
  });

  it("does not change selections when preparation fails", async () => {
    const { harness: h, adapters } = configuredHarness();
    adapters.git.snapshot = async () => { throw new Error("Git failed"); };
    await h.start();
    expect(h.setModel).not.toHaveBeenCalled();
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
    expect(h.model).toBe(h.chat);
  });

  it("restores selections and clears instructions if task submission throws", async () => {
    const { harness: h } = configuredHarness();
    vi.mocked(h.api.sendUserMessage).mockImplementationOnce(() => { throw new Error("send failed"); });
    await h.start();
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    expect(await h.emit("before_agent_start", { systemPrompt: "original" })).toBeUndefined();
    await h.start();
    expect(h.model).toBe(h.herald);
  });

  it("does not start a task after shutdown during preparation", async () => {
    const { harness: h, adapters } = configuredHarness();
    let release!: () => void;
    const original = adapters.git.snapshot;
    adapters.git.snapshot = async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original();
    };
    const starting = h.start();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const closing = h.emit("session_shutdown", { reason: "reload" });
    release();
    await Promise.all([starting, closing]);
    expect(h.setModel).not.toHaveBeenCalled();
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
  });

  it("restores after shutdown during an awaited model selection", async () => {
    const { harness: h } = configuredHarness();
    let release!: () => void;
    const select = h.setModel.getMockImplementation()!;
    h.setModel.mockImplementationOnce(async (model) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return select(model);
    });
    const starting = h.start();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const closing = h.emit("session_shutdown", { reason: "reload" });
    release();
    await Promise.all([starting, closing]);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not select a model for a replacement session after preparation", async () => {
    const { harness: h, adapters } = configuredHarness();
    const original = adapters.git.snapshot;
    adapters.git.snapshot = async () => {
      h.setSessionId("replacement");
      return original();
    };
    await h.start();
    expect(h.setModel).not.toHaveBeenCalled();
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
  });

  it("passes the current project trust state to settings access", async () => {
    const { harness: h, settings } = configuredHarness();
    h.ctx.isProjectTrusted = () => false;
    await h.start();
    expect(settings.read).toHaveBeenCalledWith({ cwd: "/worktree", projectTrusted: false });
  });

  it("does nothing without a user interface", async () => {
    const { harness: h, settings } = configuredHarness();
    await h.commands.get("herald")!.handler("commit", { ...h.ctx, hasUI: false });
    expect(settings.read).not.toHaveBeenCalled();
    expect(h.setModel).not.toHaveBeenCalled();
  });

  it("retains invalid-mode errors without reading settings", async () => {
    const { harness: h, settings } = configuredHarness();
    await h.start("invalid");
    expect(settings.read).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("Invalid Herald mode"), "error");
  });
});
