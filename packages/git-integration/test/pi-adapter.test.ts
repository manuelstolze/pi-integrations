import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerGitIntegration } from "../src/interface/pi/extension.js";
import type { GitRepositoryPort } from "../src/application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../src/application/ports/hosting-provider-port.js";

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
    start: async (mode: string) => commands.get("herald")!.handler(mode === "full" ? "" : mode, {
      hasUI: true,
      cwd: "/worktree",
      ui: { notify: vi.fn() },
    } as unknown as ExtensionCommandContext),
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
    harness.events.get("agent_settled")!({}, {});
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
      hasUI: true,
      cwd: "/worktree",
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
    await commands.get("herald")!.handler("commit", {
      hasUI: true,
      cwd: "/worktree",
      ui: { notify: vi.fn() },
    } as unknown as ExtensionCommandContext);

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
