import { describe, expect, it, vi } from "vitest";
import type {
  AcknowledgementResult,
  WarningAcknowledger,
} from "../src/application/ports/warning-acknowledger.ts";
import { warnOnOpusActivation } from "../src/application/use-cases/warn-on-opus-activation.ts";

function createAcknowledger(results: AcknowledgementResult[]) {
  const remaining = [...results];
  const acknowledger: WarningAcknowledger = {
    requestAcknowledgement: vi.fn(async () => remaining.shift() ?? "unavailable"),
  };
  return acknowledger;
}

describe("warnOnOpusActivation", () => {
  it("does not request acknowledgement when a model selection is ineligible", async () => {
    const acknowledger = createAcknowledger([]);

    await warnOnOpusActivation(
      {
        type: "model-selection",
        modelId: "provider/opus-next",
        previousModelId: "provider/claude-opus",
        source: "set",
      },
      acknowledger,
    );

    expect(acknowledger.requestAcknowledgement).not.toHaveBeenCalled();
  });

  it("requests acknowledgement when an Opus session starts", async () => {
    const acknowledger = createAcknowledger(["acknowledged"]);

    await warnOnOpusActivation(
      { type: "session-start", reason: "resume", modelId: "provider/claude-opus" },
      acknowledger,
    );

    expect(acknowledger.requestAcknowledgement).toHaveBeenCalledOnce();
  });

  it("repeats the request after cancellation until acknowledgement", async () => {
    const acknowledger = createAcknowledger(["cancelled", "cancelled", "acknowledged"]);

    await warnOnOpusActivation(
      {
        type: "model-selection",
        modelId: "provider/claude-opus",
        previousModelId: "provider/sonnet",
        source: "set",
      },
      acknowledger,
    );

    expect(acknowledger.requestAcknowledgement).toHaveBeenCalledTimes(3);
  });

  it("does not wait or retry when acknowledgement is unavailable", async () => {
    const acknowledger = createAcknowledger(["unavailable", "acknowledged"]);

    await warnOnOpusActivation(
      {
        type: "model-selection",
        modelId: "provider/claude-opus",
        previousModelId: "provider/sonnet",
        source: "cycle",
      },
      acknowledger,
    );

    expect(acknowledger.requestAcknowledgement).toHaveBeenCalledOnce();
  });
});
