import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import modelWarning, { isOpusModelId } from "../src/index.ts";

type Handler = (event: any, context: any) => Promise<void>;

function createMockApi() {
  const handlers = new Map<string, Handler>();
  const on = vi.fn((event: string, handler: Handler) => handlers.set(event, handler));
  return {
    api: { on } as unknown as ExtensionAPI,
    handlers,
    on,
  };
}

function createContext(options: {
  modelId?: string;
  hasUI?: boolean;
  mode?: ExtensionContext["mode"];
  select?: ExtensionContext["ui"]["select"];
} = {}) {
  const select = options.select ?? vi.fn(async () => "I understand — continue");
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
  source = "set",
) {
  return {
    type: "model_select",
    model: { id: modelId },
    previousModel: previousModelId ? { id: previousModelId } : undefined,
    source,
  };
}

function sessionStartEvent(reason: string) {
  return { type: "session_start", reason };
}

describe("model-warning Pi interface", () => {
  it("keeps the default extension factory and named model helper", () => {
    expect(modelWarning).toBeTypeOf("function");
    expect(isOpusModelId("vendor/Model-Opus-Next")).toBe(true);
  });

  it("registers model selection and session start events", () => {
    const { api, on } = createMockApi();

    modelWarning(api);

    expect(on).toHaveBeenCalledTimes(2);
    expect(on).toHaveBeenNthCalledWith(1, "model_select", expect.any(Function));
    expect(on).toHaveBeenNthCalledWith(2, "session_start", expect.any(Function));
  });

  it("warns when set or cycle enters Opus from a non-Opus or missing model", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext();
    const onModelSelect = handlers.get("model_select")!;

    await onModelSelect(modelSelectEvent("provider/claude-opus", "provider/sonnet"), context);
    await onModelSelect(modelSelectEvent("other/OPUS-next", undefined, "cycle"), context);

    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledWith(
      "An Opus model is active. Acknowledge to continue.",
      ["I understand — continue"],
    );
  });

  it("does not warn for restore, other sources, or Opus-to-Opus changes", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext();
    const onModelSelect = handlers.get("model_select")!;

    await onModelSelect(
      modelSelectEvent("provider/claude-opus", "provider/sonnet", "restore"),
      context,
    );
    await onModelSelect(
      modelSelectEvent("provider/claude-opus", "provider/sonnet", "other"),
      context,
    );
    await onModelSelect(
      modelSelectEvent("provider/opus-next", "provider/claude-opus"),
      context,
    );

    expect(select).not.toHaveBeenCalled();
  });

  it.each(["startup", "new", "resume", "fork"])(
    "warns when an Opus session starts with reason %s",
    async (reason) => {
      const { api, handlers } = createMockApi();
      modelWarning(api);
      const { context, select } = createContext({ modelId: "provider/claude-opus" });

      await handlers.get("session_start")!(sessionStartEvent(reason), context);

      expect(select).toHaveBeenCalledOnce();
    },
  );

  it("does not warn on reload or a session without Opus active", async () => {
    const { api, handlers } = createMockApi();
    modelWarning(api);
    const { context, select } = createContext({ modelId: "provider/claude-opus" });
    const onSessionStart = handlers.get("session_start")!;

    await onSessionStart(sessionStartEvent("reload"), context);
    await onSessionStart(
      sessionStartEvent("startup"),
      createContext({ modelId: "provider/sonnet" }).context,
    );
    await onSessionStart(sessionStartEvent("startup"), createContext().context);

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
