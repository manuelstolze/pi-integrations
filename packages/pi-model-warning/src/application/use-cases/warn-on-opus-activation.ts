import {
  shouldWarnForModelSelection,
  shouldWarnForSessionStart,
  type ModelSelectionSource,
  type SessionStartReason,
} from "../../domain/model-warning.js";
import type { WarningAcknowledger } from "../ports/warning-acknowledger.js";

export type OpusWarningRequest =
  | {
      type: "model-selection";
      modelId: string;
      previousModelId: string | undefined;
      source: ModelSelectionSource;
    }
  | {
      type: "session-start";
      reason: SessionStartReason;
      modelId: string | undefined;
    };

export type OpusWarningHandler = (
  request: OpusWarningRequest,
  acknowledger: WarningAcknowledger,
) => Promise<void>;

export async function warnOnOpusActivation(
  request: OpusWarningRequest,
  acknowledger: WarningAcknowledger,
): Promise<void> {
  const shouldWarn =
    request.type === "model-selection"
      ? shouldWarnForModelSelection(
          request.modelId,
          request.previousModelId,
          request.source,
        )
      : shouldWarnForSessionStart(request.reason, request.modelId);

  if (!shouldWarn) return;

  while (true) {
    const result = await acknowledger.requestAcknowledgement();
    if (result !== "cancelled") return;
  }
}
