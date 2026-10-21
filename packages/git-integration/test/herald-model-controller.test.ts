import { describe, expect, it } from "vitest";
import { HeraldModelController } from "../src/interface/pi/herald-model-controller.js";
import { resolveHeraldSettings } from "../src/domain/herald-settings.js";
import { createPiHarness, testModel } from "./helpers/pi-harness.js";

function setup(herald: unknown = { model: "test/herald", thinkingLevel: "low" }) {
  const harness = createPiHarness();
  const controller = new HeraldModelController(harness.api);
  const settings = resolveHeraldSettings([{ path: "project/settings.json", value: { herald } }]);
  return { harness, controller, start: () => controller.start(harness.ctx, settings) };
}

function warnings(harness: ReturnType<typeof createPiHarness>): string {
  return harness.notify.mock.calls.map((call) => call[0]).join("\n");
}

describe("Herald model controller", () => {
  it("uses a temporary model and thinking level, then restores both", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("low");
    expect(h.notify).not.toHaveBeenCalled();
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    await controller.restore(h.ctx);
    expect(h.setModel).toHaveBeenCalledTimes(2);
  });

  it("reapplies chat thinking instead of model startup defaults", async () => {
    const { harness: h, controller, start } = setup({ model: "test/herald" });
    await start();
    expect(h.thinking).toBe("high");
    await controller.restore(h.ctx);
    expect(h.thinking).toBe("high");
  });

  it("supports thinking-only settings", async () => {
    const { harness: h, controller, start } = setup({ thinkingLevel: "low" });
    await start();
    expect(h.setModel).not.toHaveBeenCalled();
    expect(h.thinking).toBe("low");
    await controller.restore(h.ctx);
    expect(h.thinking).toBe("high");
  });

  it("makes no selections or warnings without settings", async () => {
    const { harness: h, controller, start } = setup({});
    await start();
    await controller.restore(h.ctx);
    expect(h.setModel).not.toHaveBeenCalled();
    expect(h.setThinkingLevel).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("does not switch when the configured model is already selected", async () => {
    const { harness: h, start } = setup({ model: "test/chat" });
    await start();
    expect(h.setModel).not.toHaveBeenCalled();
  });

  it.each(["unknown", "authentication", "false", "throw"])("warns and uses chat for %s selection failure", async (failure) => {
    const { harness: h, controller, start } = setup();
    if (failure === "unknown") h.ctx.modelRegistry.find = () => undefined;
    if (failure === "authentication") h.ctx.modelRegistry.hasConfiguredAuth = () => false;
    if (failure === "false") h.setModel.mockResolvedValueOnce(false);
    if (failure === "throw") h.setModel.mockRejectedValueOnce(new Error("secret-key-provider-error"));
    await start();
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("low");
    expect(warnings(h)).toContain("project/settings.json");
    expect(warnings(h)).toContain("herald.model");
    expect(warnings(h)).toContain("test/chat");
    expect(warnings(h)).toMatch(/\/model|\/login/);
    expect(warnings(h)).toContain("remove herald.model");
    expect(warnings(h)).not.toContain("secret-key");
    await controller.restore(h.ctx);
    expect(h.thinking).toBe("high");
  });

  it("restores after selection throws following a model change", async () => {
    const { harness: h, controller, start } = setup();
    const select = h.setModel.getMockImplementation()!;
    h.setModel.mockImplementationOnce(async (model) => {
      await select(model);
      throw new Error("secret-provider-error");
    });
    await start();
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("low");
    expect(warnings(h)).not.toContain("secret-provider-error");
    await controller.restore(h.ctx);
    expect(h.thinking).toBe("high");
  });

  it("does not expose a provider error if rollback also fails", async () => {
    const { harness: h, start } = setup();
    const select = h.setModel.getMockImplementation()!;
    h.setModel.mockImplementationOnce(async (model) => {
      await select(model);
      throw new Error("secret-provider-error");
    }).mockRejectedValueOnce(new Error("secret-rollback-error"));
    await expect(start()).rejects.toThrow("Use /model and /login");
  });

  it("explains how to correct invalid model format", async () => {
    const { harness: h, start } = setup({ model: "invalid" });
    await start();
    expect(h.model).toBe(h.chat);
    expect(warnings(h)).toContain("provider/modelId");
    expect(warnings(h)).toContain("remove herald.model");
    expect(warnings(h)).toContain("project/settings.json");
  });

  it.each(["json", "read"] as const)("explains a %s file problem", async (reason) => {
    const h = createPiHarness();
    const controller = new HeraldModelController(h.api);
    await controller.start(h.ctx, { problems: [{ field: "herald", path: "/settings.json", reason }] });
    expect(warnings(h)).toContain("/settings.json");
    expect(warnings(h)).toContain("Fix");
    expect(warnings(h)).toContain("test/chat");
  });

  it("warns about invalid thinking without discarding a usable model", async () => {
    const { harness: h, start } = setup({ model: "test/herald", thinkingLevel: "wrong" });
    await start();
    expect(h.model).toBe(h.herald);
    expect(h.thinking).toBe("high");
    expect(warnings(h)).toContain("herald.thinkingLevel");
    expect(warnings(h)).toContain("remove the field");
    expect(warnings(h)).toContain("project/settings.json");
  });

  it("warns when the selected model limits thinking", async () => {
    const { harness: h, start } = setup({ model: "test/limited", thinkingLevel: "high" });
    const limited = testModel("limited", false);
    h.models.push(limited);
    await start();
    expect(h.model).toBe(limited);
    expect(h.thinking).toBe("off");
    expect(warnings(h)).toContain("/thinking");
    expect(warnings(h)).toContain("Using thinking level off");
  });

  it("preserves a manual model selection and its thinking change", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    await h.api.setModel(h.manual);
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.manual);
    expect(h.thinking).toBe("medium");
  });

  it("preserves manual thinking across model restoration", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    h.api.setThinkingLevel("xhigh");
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("xhigh");
  });

  it("restores the old model and warns if manual thinking is incompatible", async () => {
    const { harness: h, controller, start } = setup();
    h.chat.reasoning = false;
    h.api.setThinkingLevel("off");
    await start();
    h.api.setThinkingLevel("xhigh");
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("off");
    expect(warnings(h)).toContain("does not support your selected thinking level");
    expect(warnings(h)).toContain("/thinking");
  });

  it("does not reclaim a model changed away and back", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    await h.api.setModel(h.manual);
    await h.api.setModel(h.herald);
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.herald);
  });

  it("does not reclaim a thinking level changed away and back", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    h.api.setThinkingLevel("xhigh");
    h.api.setThinkingLevel("low");
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("low");
  });

  it("tracks delayed own thinking events without losing restoration", async () => {
    const { harness: h, controller, start } = setup();
    h.delayThinkingEvents();
    await start();
    await h.flushThinkingEvents();
    await controller.restore(h.ctx);
    expect(h.model).toBe(h.chat);
    expect(h.thinking).toBe("high");
    await h.flushThinkingEvents();
  });

  it("does not mutate a replacement session", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    const calls = h.setModel.mock.calls.length;
    h.setSessionId("replacement");
    await controller.restore(h.ctx);
    expect(h.setModel).toHaveBeenCalledTimes(calls);
  });

  it("reports restoration failure without exposing provider errors", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    h.setModel.mockRejectedValueOnce(new Error("secret-key"));
    await controller.restore(h.ctx);
    expect(warnings(h)).toContain("could not restore");
    expect(warnings(h)).toContain("/model");
    expect(warnings(h)).not.toContain("secret-key");
  });

  it("shares cleanup while restoration is in progress", async () => {
    const { harness: h, controller, start } = setup();
    await start();
    await Promise.all([controller.restore(h.ctx), controller.restore(h.ctx)]);
    expect(h.setModel).toHaveBeenCalledTimes(2);
  });
});
