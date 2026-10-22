import { vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { THINKING_LEVELS, type HeraldThinkingLevel } from "../../src/domain/herald-settings.js";

type Model = NonNullable<ExtensionContext["model"]>;
export const testModel = (id: string, reasoning = true): Model => ({
  id, provider: "test", name: id, api: "openai-completions", baseUrl: "http://unused.invalid",
  reasoning, thinkingLevelMap: { xhigh: "xhigh", max: "max" },
  input: ["text"], contextWindow: 100000, maxTokens: 1000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

export function createPiHarness() {
  const chat = testModel("chat");
  const herald = testModel("herald");
  const manual = testModel("manual");
  const models = [chat, herald, manual];
  let current = chat;
  let thinking: HeraldThinkingLevel = "high";
  let sessionId = "session-1";
  const entries: SessionEntry[] = [];
  const appendEntry = (entry: Record<string, unknown>) => entries.push({
    id: String(entries.length + 1), parentId: entries.at(-1)?.id ?? null, timestamp: new Date().toISOString(), ...entry,
  } as SessionEntry);
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
  const tools = new Map<string, any>();
  let activeTools = ["read", "bash"];
  const queuedThinking: Array<{ level: HeraldThinkingLevel; previousLevel: HeraldThinkingLevel }> = [];
  let delayThinking = false;
  const notify = vi.fn();
  const ctx = {
    hasUI: true,
    mode: "tui",
    cwd: "/worktree",
    get model() { return current; },
    sessionManager: { getSessionId: () => sessionId, getBranch: () => [...entries] },
    modelRegistry: {
      find: vi.fn((provider: string, id: string) => models.find((model) => model.provider === provider && model.id === id)),
      hasConfiguredAuth: vi.fn(() => true),
    },
    waitForIdle: vi.fn(async () => {}),
    isIdle: vi.fn(() => true),
    abort: vi.fn(),
    isProjectTrusted: vi.fn(() => true),
    ui: { notify, confirm: vi.fn(async () => true), setStatus: vi.fn() },
  } as unknown as ExtensionCommandContext;

  async function emit(type: string, event: any = {}, context: any = ctx) {
    let result;
    for (const handler of handlers.get(type) ?? []) result = await handler({ type, ...event }, context);
    return result;
  }

  const setThinkingLevel = vi.fn((level: HeraldThinkingLevel) => {
    const previousLevel = thinking;
    thinking = current.reasoning && THINKING_LEVELS.includes(level) ? level : "off";
    if (thinking !== previousLevel) {
      appendEntry({ type: "thinking_level_change", thinkingLevel: thinking });
      const event = { level: thinking, previousLevel };
      if (delayThinking) queuedThinking.push(event);
      else void emit("thinking_level_select", event);
    }
  });
  const setModel = vi.fn(async (model: Model) => {
    const previousModel = current;
    current = model;
    appendEntry({ type: "model_change", provider: model.provider, modelId: model.id });
    setThinkingLevel("medium");
    await emit("model_select", { model, previousModel, source: "set" });
    return true;
  });
  const api = {
    on: vi.fn((event: string, handler: (event: any, ctx: any) => unknown) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => handlers.set(event, list.filter((value) => value !== handler));
    }),
    registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
    registerTool: vi.fn((tool: any) => tools.set(tool.name, tool)),
    getActiveTools: vi.fn(() => [...activeTools]),
    setActiveTools: vi.fn((names: string[]) => { activeTools = [...names]; }),
    sendUserMessage: vi.fn(),
    getThinkingLevel: vi.fn(() => thinking),
    setThinkingLevel,
    setModel,
  } as unknown as ExtensionAPI;

  return {
    api, ctx, chat, herald, manual, models, notify, emit, setModel, setThinkingLevel, commands, tools,
    finish: (status = "completed", context: any = ctx) => tools.get("herald_finish").execute("finish-1", { status, summary: "Test workflow ended." }, undefined, undefined, context),
    get model() { return current; },
    get thinking() { return thinking; },
    setSessionId: (id: string) => { sessionId = id; },
    delayThinkingEvents: () => { delayThinking = true; },
    flushThinkingEvents: async () => {
      for (const event of queuedThinking.splice(0)) await emit("thinking_level_select", event);
    },
    start: (args = "commit") => commands.get("herald")!.handler(args, ctx),
  };
}
