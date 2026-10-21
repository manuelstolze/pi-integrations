import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
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
  const events = new Map<string, (event: any, ctx: any) => unknown>();
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
  const api = {
    on: vi.fn((event: string, handler: (value: unknown, ctx: unknown) => unknown) => events.set(event, handler)),
    registerCommand: vi.fn((name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
      commands.set(name, options);
    }),
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  registerGitIntegration(api, () => fakeAdapters());

  return {
    events,
    commands,
    start: async (mode: string) => commands.get("herald")!.handler(mode === "full" ? "" : mode, createPiHarness().ctx),
    callTool: (command: string, ctx: any) => events.get("tool_call")!({
      type: "tool_call",
      toolName: "bash",
      input: { command },
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

  it("does not carry the mode or provider into the next agent turn", async () => {
    const harness = createHarness();
    await harness.start("full");
    await harness.events.get("agent_settled")!({}, createPiHarness().ctx);
    const confirm = vi.fn(async () => true);

    const result = await harness.callTool("glab mr create --title test", { hasUI: true, ui: { confirm } });

    expect(result).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("registers the command and starts a prepared agent turn", async () => {
    const events = new Map<string, (event: any, ctx: any) => unknown>();
    const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
    const api = {
      on: vi.fn((event: string, handler: (value: unknown, ctx: unknown) => unknown) => events.set(event, handler)),
      registerCommand: vi.fn((name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
        commands.set(name, options);
      }),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;
    const adapters = fakeAdapters();
    const notify = vi.fn();

    registerGitIntegration(api, (cwd) => {
      expect(cwd).toBe("/worktree");
      return adapters;
    });

    await commands.get("herald")!.handler("commit", {
      ...createPiHarness().ctx,
      ui: { notify },
    } as unknown as ExtensionCommandContext);

    expect(notify).toHaveBeenCalledWith("Herald — commit mode", "info");
    expect(api.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("## Git Integration — commit mode"));
    expect(adapters.hosting.resolve).not.toHaveBeenCalled();
  });

  it("blocks a denied commit command while Herald is active", async () => {
    const events = new Map<string, (event: any, ctx: any) => unknown>();
    const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
    const api = {
      on: vi.fn((event: string, handler: (value: unknown, ctx: unknown) => unknown) => events.set(event, handler)),
      registerCommand: vi.fn((name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
        commands.set(name, options);
      }),
      sendUserMessage: vi.fn(),
    } as unknown as ExtensionAPI;
    const confirm = vi.fn(async () => false);

    registerGitIntegration(api, () => fakeAdapters());
    await commands.get("herald")!.handler("commit", createPiHarness().ctx);

    const result = await events.get("tool_call")!({
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

describe("Herald settings lifecycle", () => {
  it.each(["", "commit", "request"])("applies and restores selections for mode %j", async (mode) => {
    const { harness: h } = configuredHarness();
    await h.start(mode);
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");
    expect(h.api.sendUserMessage).toHaveBeenCalledOnce();
    await h.emit("agent_end");
    expect(h.model).toBe(h.herald);
    await h.emit("agent_settled", { aborted: false });
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
  });

  it.each(["settled", "cancelled", "reload", "new", "resume", "fork", "quit"])("cleans up on %s", async (boundary) => {
    const { harness: h } = configuredHarness();
    await h.start();
    if (boundary === "settled" || boundary === "cancelled") {
      await h.emit("agent_settled", { aborted: boundary === "cancelled" });
    } else {
      await h.emit("session_shutdown", { reason: boundary });
    }
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    expect(await h.emit("before_agent_start", { systemPrompt: "original" })).toBeUndefined();
  });

  it("reads new settings only on the next run", async () => {
    const { harness: h, settings, configure } = configuredHarness();
    await h.start();
    configure({ model: "test/manual", thinkingLevel: "xhigh" });
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");
    expect(settings.read).toHaveBeenCalledOnce();
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
