import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PermissionGate } from "../src/application/use-cases/permission-gate.ts";
import { registerPermissionGate } from "../src/interface/pi/extension.ts";
import { PiPermissionApprovalAdapter } from "../src/interface/pi/permission-approval-adapter.ts";

type Handler = (...args: any[]) => unknown;

function createMockApi() {
  const handlers = new Map<string, Handler>();
  const api = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    events: { emit: vi.fn() },
    sendUserMessage: vi.fn(),
  } as unknown as ExtensionAPI;
  return { api, handlers };
}

function createContext(options: {
  hasUI?: boolean;
  customResult?: string | undefined;
  selection?: string | undefined;
  instruction?: string | undefined;
} = {}) {
  const notify = vi.fn();
  const custom = vi.fn(async () => options.customResult);
  const select = vi.fn(async () => options.selection);
  const input = vi.fn(async () => options.instruction);
  const context = {
    hasUI: options.hasUI ?? true,
    ui: { notify, custom, select, input },
  };
  return { context, notify, custom, select, input };
}

async function callTool(handler: Handler, command: string, context: unknown): Promise<unknown> {
  return handler({ toolName: "bash", input: { command } }, context);
}

function createGate(outcome: Awaited<ReturnType<PermissionGate["handleCommand"]>>): PermissionGate {
  return {
    startSession: vi.fn(() => undefined),
    handleCommand: vi.fn(async () => outcome),
  };
}

describe("Pi interface", () => {
  beforeEach(() => {
    delete process.env.HERDR_ENV;
  });

  it("registers session and tool-call handlers and reports config errors", async () => {
    const { api, handlers } = createMockApi();
    const gate = createGate({ kind: "allow" });
    gate.startSession = vi.fn(() => new Error("invalid config"));
    registerPermissionGate(api, gate);
    const { context, notify } = createContext();

    expect(handlers.has("session_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
    await handlers.get("session_start")!({}, context);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("invalid config"), "warning");
  });

  it("notifies and blocks an auto-deny result", async () => {
    const { api, handlers } = createMockApi();
    const gate = createGate({ kind: "auto-deny", pattern: "az group delete", reason: "deletes a group" });
    registerPermissionGate(api, gate);
    const { context, notify } = createContext();

    const result = await callTool(handlers.get("tool_call")!, "az group delete", context);

    expect(result).toEqual({ block: true, reason: "Catastrophic command auto-blocked: deletes a group" });
    expect(notify).toHaveBeenCalledWith("Auto-blocked: az group delete — deletes a group", "error");
    expect(gate.handleCommand).toHaveBeenCalledWith("az group delete", expect.any(PiPermissionApprovalAdapter));
  });

  it("blocks a dangerous command when the Pi adapter has no user interface", async () => {
    const { api, handlers } = createMockApi();
    registerPermissionGate(api, createGate({ kind: "approval-unavailable", description: "superuser command" }));
    const { context } = createContext({ hasUI: false });

    const result = await callTool(handlers.get("tool_call")!, "sudo reboot", context);

    expect(result).toEqual({
      block: true,
      reason: "Dangerous command blocked (no UI to confirm): superuser command",
    });
  });

  it("sends a denial instruction to Pi as a steer message", async () => {
    const { api, handlers } = createMockApi();
    registerPermissionGate(api, createGate({ kind: "user-deny", instruction: "Use a safer command." }));
    const { context } = createContext();

    const result = await callTool(handlers.get("tool_call")!, "sudo reboot", context);

    expect(result).toEqual({ block: true, reason: "User denied dangerous command" });
    expect(api.sendUserMessage).toHaveBeenCalledWith(
      "The command `sudo reboot` was blocked. Please do the following instead: Use a safer command.",
      { deliverAs: "steer" },
    );
  });

  it("uses the built-in selection when the custom dialog returns no result", async () => {
    const { context, custom, select } = createContext({ selection: "3 - Allow forever" });
    const reportActive = vi.fn();
    const reportInactive = vi.fn();
    const adapter = new PiPermissionApprovalAdapter(context as never, reportActive, reportInactive);

    await expect(adapter.request("sudo reboot", "superuser command")).resolves.toEqual({
      kind: "allow-forever",
    });

    expect(custom).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
    expect(reportActive).toHaveBeenCalledWith("superuser command");
    expect(reportInactive).toHaveBeenCalledOnce();
  });

  it("asks for an alternative instruction after the user denies a command", async () => {
    const { context, input } = createContext({ customResult: "deny", instruction: "Run a safe check." });
    const adapter = new PiPermissionApprovalAdapter(context as never, vi.fn(), vi.fn());

    await expect(adapter.request("sudo reboot", "superuser command")).resolves.toEqual({
      kind: "deny",
      instruction: "Run a safe check.",
    });
    expect(input).toHaveBeenCalledWith("Tell pi what to do instead:", "");
  });
});
