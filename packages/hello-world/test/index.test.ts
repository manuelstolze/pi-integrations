import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import helloWorld from "../src/index.ts";

function createMockApi() {
  type RegisteredCommand = {
    description?: string;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  };
  const commands = new Map<string, RegisteredCommand>();
  const api = {
    registerCommand: vi.fn((name: string, options: RegisteredCommand) => {
      commands.set(name, options);
    }),
  } as unknown as ExtensionAPI;
  return { api, commands };
}

function createMockContext(notify = vi.fn()) {
  return { ui: { notify } } as unknown as ExtensionCommandContext;
}

describe("pi-hello-world extension", () => {
  it("registers a /hello command", () => {
    const { api, commands } = createMockApi();

    helloWorld(api);

    expect(api.registerCommand).toHaveBeenCalledWith("hello", expect.objectContaining({ handler: expect.any(Function) }));
    expect(commands.has("hello")).toBe(true);
  });

  it("greets the given name", async () => {
    const { api, commands } = createMockApi();
    helloWorld(api);
    const notify = vi.fn();
    const ctx = createMockContext(notify);

    await commands.get("hello")!.handler("Ada", ctx);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Hello, Ada!"));
  });

  it("defaults to greeting the world when no name is given", async () => {
    const { api, commands } = createMockApi();
    helloWorld(api);
    const notify = vi.fn();
    const ctx = createMockContext(notify);

    await commands.get("hello")!.handler("  ", ctx);

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Hello, world!"));
  });
});
