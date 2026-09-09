import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerGitIntegration } from "../src/adapters/pi/extension.js";
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

describe("Pi Git integration adapter", () => {
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

    expect(confirm).toHaveBeenCalled();
    expect(result).toMatchObject({ block: true });
  });
});
