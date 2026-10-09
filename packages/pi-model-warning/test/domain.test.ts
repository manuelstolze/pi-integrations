import { describe, expect, it } from "vitest";
import {
  isOpusModelId,
  shouldWarnForModelSelection,
  shouldWarnForSessionStart,
} from "../src/domain/model-warning.ts";

describe("model-warning domain rules", () => {
  it("matches Opus in model IDs without case sensitivity", () => {
    expect(isOpusModelId("vendor/Model-Opus-Next")).toBe(true);
    expect(isOpusModelId("anthropic/claude-opus-4")).toBe(true);
    expect(isOpusModelId("vendor/sonnet")).toBe(false);
    expect(isOpusModelId(undefined)).toBe(false);
  });

  it.each(["set", "cycle"] as const)(
    "warns when a %s selection enters Opus from a non-Opus or missing model",
    (source) => {
      expect(shouldWarnForModelSelection("provider/claude-opus", "provider/sonnet", source)).toBe(
        true,
      );
      expect(shouldWarnForModelSelection("other/OPUS-next", undefined, source)).toBe(true);
    },
  );

  it("does not warn for restore or an Opus-to-Opus selection", () => {
    expect(
      shouldWarnForModelSelection("provider/claude-opus", "provider/sonnet", "restore"),
    ).toBe(false);
    expect(
      shouldWarnForModelSelection("provider/claude-opus", "provider/sonnet", "other"),
    ).toBe(false);
    expect(
      shouldWarnForModelSelection("provider/opus-next", "provider/claude-opus", "set"),
    ).toBe(false);
  });

  it.each(["startup", "new", "resume", "fork"] as const)(
    "warns for an Opus session started with reason %s",
    (reason) => {
      expect(shouldWarnForSessionStart(reason, "provider/claude-opus")).toBe(true);
    },
  );

  it("does not warn for reload or for a session without Opus active", () => {
    expect(shouldWarnForSessionStart("reload", "provider/claude-opus")).toBe(false);
    expect(shouldWarnForSessionStart("startup", "provider/sonnet")).toBe(false);
    expect(shouldWarnForSessionStart("startup", undefined)).toBe(false);
  });
});
