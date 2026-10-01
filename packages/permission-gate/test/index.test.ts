import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import permissionGate from "../src/index.ts";

const { mockReadConfig } = vi.hoisted(() => ({
  mockReadConfig: vi.fn(() => ({ config: {} })),
}));

vi.mock("../src/config.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.ts")>();
  return { ...actual, readConfig: mockReadConfig };
});

type Handler = (...args: unknown[]) => unknown;

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
  result?: string | undefined;
  input?: string | undefined;
} = {}) {
  const notify = vi.fn();
  const custom = vi.fn(async () => options.result);
  const select = vi.fn(async () => options.result?.replace("allow-", "") ?? undefined);
  const input = vi.fn(async () => options.input);
  const context = {
    hasUI: options.hasUI ?? true,
    ui: { notify, custom, select, input },
  };
  return { context, notify, custom, select, input };
}

async function startSession(handler: Handler, context: unknown): Promise<void> {
  await handler({}, context);
}

async function callTool(handler: Handler, command: string, context: unknown): Promise<unknown> {
  return handler({ toolName: "bash", input: { command } }, context);
}

describe("pi-permission-gate extension", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ config: {} });
  });

  it("registers session and tool-call handlers", () => {
    const { api, handlers } = createMockApi();

    permissionGate(api);

    expect(handlers.has("session_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
  });

  it("blocks auto-deny commands before showing the permission dialog", async () => {
    mockReadConfig.mockReturnValue({ config: { permissionGate: { allowedPatterns: [{ pattern: "az group delete" }] } } });
    const { api, handlers } = createMockApi();
    permissionGate(api);
    const { context, notify, custom } = createContext();
    await startSession(handlers.get("session_start")!, context);

    const result = await callTool(handlers.get("tool_call")!, "az group delete --name demo", context);

    expect(result).toMatchObject({ block: true });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Auto-blocked"), "error");
    expect(custom).not.toHaveBeenCalled();
  });

  it("blocks dangerous commands when there is no user interface", async () => {
    const { api, handlers } = createMockApi();
    permissionGate(api);
    const { context } = createContext({ hasUI: false });
    await startSession(handlers.get("session_start")!, context);

    const result = await callTool(handlers.get("tool_call")!, "sudo reboot", context);

    expect(result).toMatchObject({ block: true, reason: expect.stringContaining("no UI") });
  });

  it("allows a command once after the custom dialog choice", async () => {
    const { api, handlers } = createMockApi();
    permissionGate(api);
    const { context, custom } = createContext({ result: "allow-once" });
    await startSession(handlers.get("session_start")!, context);

    const result = await callTool(handlers.get("tool_call")!, "sudo reboot", context);

    expect(result).toBeUndefined();
    expect(custom).toHaveBeenCalledOnce();
  });

  it("sends a denial instruction back to Pi as a steer message", async () => {
    const { api, handlers } = createMockApi();
    permissionGate(api);
    const { context, input } = createContext({ result: "deny", input: "Use the safer command." });
    await startSession(handlers.get("session_start")!, context);

    const result = await callTool(handlers.get("tool_call")!, "sudo reboot", context);

    expect(result).toMatchObject({ block: true });
    expect(input).toHaveBeenCalledOnce();
    expect(api.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Use the safer command."),
      { deliverAs: "steer" },
    );
  });
});
