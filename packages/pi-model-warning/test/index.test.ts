import { describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ModelSelectEvent,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import modelWarning, { isOpusModelId } from "../src/index.ts";

type Handler = (event: any, context: any) => unknown;

function createMockApi() {
  const handlers = new Map<string, Handler>();
  const api = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
  } as unknown as ExtensionAPI;
  return { api, handlers };
}

function createContext(options: {
  modelId?: string;
  hasUI?: boolean;
  mode?: ExtensionContext["mode"];
  selections?: Array<string | undefined>;
  select?: ExtensionContext["ui"]["select"];
} = {}) {
  const selections = [...(options.selections ?? [])];
  const select =
    options.select ??
    vi.fn(async () =>
      options.selections === undefined ? "I understand — continue" : selections.shift(),
    );
  const context = {
    hasUI: options.hasUI ?? true,
    mode: options.mode ?? "tui",
    model: options.modelId ? { id: options.modelId } : undefined,
    ui: { select },
  } as unknown as ExtensionContext;
  return { context, select };
}

function modelSelectEvent(
  modelId: string,
  previousModelId: string | undefined,
  source: ModelSelectEvent["source"] = "set",
): ModelSelectEvent {
  return {
    type: "model_select",
    model: { id: modelId },
    previousModel: previousModelId ? { id: previousModelId } : undefined,
    source,
  } as ModelSelectEvent;
}

function sessionStartEvent(reason: SessionStartEvent["reason"]): SessionStartEvent {
  return { type: "session_start", reason };
}

describe("pi-model-warning extension", () => {
  it("matches Opus in model IDs without case sensitivity", () => {
    expect(isOpusModelId("vendor/Model-Opus-Next")).toBe(true);
    expect(isOpusModelId("anthropic/claude-opus-4")).toBe(true);
    expect(isOpusModelId("vendor/sonnet")).toBe(false);
    expect(isOpusModelId(undefined)).toBe(false);
  });

  it("warns when a non-Opus or missing model changes to Opus", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext();
    const onModelSelect = handlers.get("model_select")!;

    await onModelSelect(modelSelectEvent("provider/claude-opus", "provider/sonnet"), context);
    await onModelSelect(modelSelectEvent("other/OPUS-next", undefined, "cycle"), context);

    expect(select).toHaveBeenCalledTimes(2);
  });

  it("does not warn for Opus-to-Opus changes", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext();

    await handlers.get("model_select")!(
      modelSelectEvent("provider/opus-next", "provider/claude-opus"),
      context,
    );

    expect(select).not.toHaveBeenCalled();
  });

  it.each(["startup", "new", "resume", "fork"] as const)(
    "warns when an Opus session starts with reason %s",
    async (reason) => {
      const { api, handlers } = createMockApi();
      modelWarning(api);
      const { context, select } = createContext({ modelId: "provider/claude-opus" });

      await handlers.get("session_start")!(sessionStartEvent(reason), context);

      expect(select).toHaveBeenCalledOnce();
    },
  );

  it("does not warn on reload", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext({ modelId: "provider/claude-opus" });

    await handlers.get("session_start")!(sessionStartEvent("reload"), context);

    expect(select).not.toHaveBeenCalled();
  });

  it("uses session start for restore and does not show a duplicate model warning", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext({ modelId: "provider/claude-opus" });

    await handlers.get("model_select")!(
      modelSelectEvent("provider/claude-opus", "provider/sonnet", "restore"),
      context,
    );
    await handlers.get("session_start")!(sessionStartEvent("resume"), context);

    expect(select).toHaveBeenCalledOnce();
  });

  it.each(["tui", "rpc"] as const)(
    "waits for explicit acknowledgement in %s mode and repeats after cancellation",
    async (mode) => {
      const { api, handlers } = createMockApi();
      modelWarning(api);
      let cancelWarning!: (selection: string | undefined) => void;
      const select = vi
        .fn<ExtensionContext["ui"]["select"]>()
        .mockImplementationOnce(
          () => new Promise((resolve) => {
            cancelWarning = resolve;
          }),
        )
        .mockResolvedValueOnce("I understand — continue");
      const { context } = createContext({ mode, select });
      let completed = false;
      const warning = handlers
        .get("model_select")!(modelSelectEvent("provider/claude-opus", "provider/sonnet"), context)
        .then(() => {
          completed = true;
        });

      expect(select).toHaveBeenCalledOnce();
      expect(completed).toBe(false);
      cancelWarning(undefined);
      await warning;

      expect(completed).toBe(true);
      expect(select).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["json", "print"] as const)(
    "does not request UI or wait in %s mode",
    async (mode) => {
      const { api, handlers } = createMockApi();
      modelWarning(api);
      const { context, select } = createContext({ mode, hasUI: false });

      await handlers.get("model_select")!(
        modelSelectEvent("provider/claude-opus", "provider/sonnet"),
        context,
      );
      await handlers.get("session_start")!(sessionStartEvent("startup"), context);

      expect(select).not.toHaveBeenCalled();
    },
  );
});
