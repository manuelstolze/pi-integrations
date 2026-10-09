import type {
  ExtensionAPI,
  ExtensionContext,
  ModelSelectEvent,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

const ACKNOWLEDGEMENT = "I understand — continue";
const SESSION_START_REASONS = new Set<SessionStartEvent["reason"]>([
  "startup",
  "new",
  "resume",
  "fork",
]);

export function isOpusModelId(modelId: string | undefined): boolean {
  return modelId?.toLowerCase().includes("opus") ?? false;
}

function isOpusModelSelect(event: ModelSelectEvent): boolean {
  return (
    event.source !== "restore" &&
    isOpusModelId(event.model.id) &&
    !isOpusModelId(event.previousModel?.id)
  );
}

async function acknowledgeOpusWarning(context: ExtensionContext): Promise<void> {
  if (!context.hasUI) return;

  while (true) {
    const selection = await context.ui.select(
      "An Opus model is active. Acknowledge to continue.",
      [ACKNOWLEDGEMENT],
    );
    if (selection === ACKNOWLEDGEMENT) return;
  }
}

const modelWarning: (pi: ExtensionAPI) => void = (pi) => {
  pi.on("model_select", async (event, context) => {
    if (!isOpusModelSelect(event)) return;
    await acknowledgeOpusWarning(context);
  });

  pi.on("session_start", async (event, context) => {
    if (!SESSION_START_REASONS.has(event.reason)) return;
    if (!isOpusModelId(context.model?.id)) return;
    await acknowledgeOpusWarning(context);
  });
};

export default modelWarning;
