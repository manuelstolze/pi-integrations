import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { OpusWarningHandler } from "../../application/use-cases/warn-on-opus-activation.js";
import type {
  ModelSelectionSource,
  SessionStartReason,
} from "../../domain/model-warning.js";
import type { WarningAcknowledger } from "../../application/ports/warning-acknowledger.js";

const ACKNOWLEDGEMENT = "I understand — continue";
const WARNING_TEXT = "An Opus model is active. Acknowledge to continue.";

function mapModelSelectionSource(source: string): ModelSelectionSource {
  if (source === "set" || source === "cycle" || source === "restore") return source;
  return "other";
}

function mapSessionStartReason(reason: string): SessionStartReason {
  if (reason === "startup" || reason === "new" || reason === "resume" || reason === "fork") {
    return reason;
  }
  return "reload";
}

function createWarningAcknowledger(context: ExtensionContext): WarningAcknowledger {
  return {
    async requestAcknowledgement() {
      if (!context.hasUI) return "unavailable";
      const selection = await context.ui.select(WARNING_TEXT, [ACKNOWLEDGEMENT]);
      return selection === ACKNOWLEDGEMENT ? "acknowledged" : "cancelled";
    },
  };
}

export function registerModelWarningExtension(
  pi: ExtensionAPI,
  warnOnOpusActivation: OpusWarningHandler,
): void {
  pi.on("model_select", async (event, context) => {
    await warnOnOpusActivation(
      {
        type: "model-selection",
        modelId: event.model.id,
        previousModelId: event.previousModel?.id,
        source: mapModelSelectionSource(event.source),
      },
      createWarningAcknowledger(context),
    );
  });

  pi.on("session_start", async (event, context) => {
    await warnOnOpusActivation(
      {
        type: "session-start",
        reason: mapSessionStartReason(event.reason),
        modelId: context.model?.id,
      },
      createWarningAcknowledger(context),
    );
  });
}
