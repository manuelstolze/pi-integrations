import { describe, expect, it, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerGitIntegration } from "../src/interface/pi/extension.js";
import type { GitRepositoryPort } from "../src/application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../src/application/ports/hosting-provider-port.js";
import { createPiHarness } from "./helpers/pi-harness.js";

function fakeAdapters(): { git: GitRepositoryPort; hosting: HostingProviderPort } {
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
  };
}

function createHarness() {
  const h = createPiHarness();
  registerGitIntegration(h.api, () => fakeAdapters());
  return {
    ...h,
    start: (mode: string) => h.start(mode === "full" ? "" : mode),
    callTool: (command: string, ctx: any) => h.emit("tool_call", {
      toolName: "bash", input: { command },
    }, ctx),
  };
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
    { mode: "commit", command: "git commit -m test", allowed: true },
    { mode: "commit", command: "git push origin HEAD", allowed: false },
    { mode: "commit", command: "gh pr create --title test", allowed: false },
    { mode: "commit", command: "glab mr create --title test", allowed: false },
    { mode: "request", command: "git commit -m test", allowed: false },
    { mode: "request", command: "git push origin HEAD", allowed: true },
    { mode: "request", command: "gh pr create --title test", allowed: true },
    { mode: "request", command: "glab mr create --title test", allowed: true },
    { mode: "full", command: "git commit -m test", allowed: true },
    { mode: "full", command: "git push origin HEAD", allowed: true },
    { mode: "full", command: "gh pr create --title test", allowed: true },
    { mode: "full", command: "glab mr create --title test", allowed: true },
  ])("$mode mode handles $command", async ({ mode, command, allowed }) => {
    const harness = createHarness();
    await harness.start(mode);
    const confirm = vi.fn(async () => true);

    const result = await harness.callTool(command, { hasUI: true, ui: { confirm } });

    if (allowed) {
      expect(result).toBeUndefined();
      expect(confirm).toHaveBeenCalledOnce();
      expect(confirm.mock.calls[0][1]).toContain(command);
    } else {
      expect(result).toMatchObject({ block: true });
      expect(confirm).not.toHaveBeenCalled();
    }
  });

  it("blocks a mixed command when one action is not allowed", async () => {
    const harness = createHarness();
    await harness.start("commit");
    const confirm = vi.fn(async () => true);

    const result = await harness.callTool("git commit -m test && git push origin HEAD", {
      hasUI: true,
      ui: { confirm },
    });

    expect(result).toMatchObject({ block: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("blocks an allowed action when the tool call has no UI", async () => {
    const harness = createHarness();
    await harness.start("full");

    const result = await harness.callTool("git commit -m test", { hasUI: false });

    expect(result).toMatchObject({ block: true });
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

  it("blocks a denied commit command while Herald is active", async () => {
    const { api, commands, ctx, emit } = createPiHarness();
    const confirm = vi.fn(async () => false);

    registerGitIntegration(api, () => fakeAdapters());
    await commands.get("herald")!.handler("commit", ctx);

    const result = await emit("tool_call", {
      type: "tool_call",
      toolName: "bash",
      input: { command: "git commit -m test" },
    }, { hasUI: true, ui: { confirm } });

    expect(confirm).toHaveBeenCalledWith(
      "Git integration approval required",
      expect.stringContaining("git commit -m test"),
    );
    expect(result).toMatchObject({ block: true });
  });
});

function configuredHarness() {
  const harness = createPiHarness();
  const adapters = fakeAdapters();
  let herald: unknown = { model: "test/herald", thinkingLevel: "low" };
  const settings = { read: vi.fn(async () => ({
    sources: [{ path: "/project/.pi/settings.json", value: { herald } }], problems: [],
  })) };
  registerGitIntegration(harness.api, () => adapters, settings);
  return { harness, adapters, settings, configure: (value: unknown) => { herald = value; } };
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

  it.each([false, true])("keeps all mode checks after chat approval, configured: %s", async (configured) => {
    for (const mode of ["commit", "request", ""] as const) {
      const setup = configuredHarness();
      const h = setup.harness;
      if (!configured) setup.configure({});
      await h.start(mode);
      await h.emit("before_agent_start", { systemPrompt: "original" });
      await h.emit("agent_settled");
      await h.emit("before_agent_start", { systemPrompt: "original", prompt: "Yes" });
      for (const [command, allowed] of [
        ["git commit -m test", mode !== "request"],
        ["git push origin HEAD", mode !== "commit"],
        ["gh pr create --title test", mode !== "commit"],
        ["glab mr create --title test", mode !== "commit"],
      ] as const) {
        vi.mocked(h.ctx.ui.confirm).mockClear();
        const result = await h.emit("tool_call", { toolName: "bash", input: { command } });
        if (allowed) {
          expect(result).toBeUndefined();
          expect(h.ctx.ui.confirm).toHaveBeenCalledWith("Git integration approval required", expect.stringContaining(command));
        } else {
          expect(result).toMatchObject({ block: true });
          expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
        }
      }
      if (mode !== "") {
        expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git commit -m test && git push" } })).toMatchObject({ block: true });
      }
      const allowedCommand = mode === "request" ? "git push" : "git commit -m test";
      expect(await h.emit("tool_call", { toolName: "bash", input: { command: allowedCommand } }, { hasUI: false })).toMatchObject({ block: true });
      vi.mocked(h.ctx.ui.confirm).mockResolvedValueOnce(false);
      expect(await h.emit("tool_call", { toolName: "bash", input: { command: allowedCommand } })).toMatchObject({ block: true });
    }
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

  it("does not run a command approved after cancellation", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    let approve!: (value: boolean) => void;
    vi.mocked(h.ctx.ui.confirm).mockImplementationOnce(() => new Promise((resolve) => { approve = resolve; }));
    const command = h.emit("tool_call", { toolName: "bash", input: { command: "git commit -m test" } });
    await h.start("cancel");
    approve(true);
    expect(await command).toMatchObject({ block: true });
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
  it("keeps Herald selections and instructions while waiting for chat approval", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    const first = await h.emit("before_agent_start", { systemPrompt: "original" });
    await h.emit("agent_end", { messages: [{ role: "assistant", content: "Should I commit this plan?" }] });
    await h.emit("agent_settled", { aborted: false });
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");
    const reply = await h.emit("before_agent_start", { systemPrompt: "original", prompt: "Yes, commit it." });
    expect(reply).toEqual(first);
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git push origin HEAD" } })).toMatchObject({ block: true });
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git commit -m test" } })).toBeUndefined();
    expect(h.ctx.ui.confirm).toHaveBeenCalledOnce();
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

  it("keeps mode approval checks while using a configured model", async () => {
    const { harness: h } = configuredHarness();
    await h.start();
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git push origin HEAD" } })).toMatchObject({ block: true });
    expect(await h.emit("tool_call", { toolName: "bash", input: { command: "git commit -m test" } })).toBeUndefined();
    expect(h.ctx.ui.confirm).toHaveBeenCalledOnce();
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
