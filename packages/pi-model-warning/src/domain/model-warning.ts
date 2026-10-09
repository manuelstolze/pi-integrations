export type ModelSelectionSource = "set" | "cycle" | "restore" | "other";

export type SessionStartReason = "startup" | "new" | "resume" | "fork" | "reload";

export function isOpusModelId(modelId: string | undefined): boolean {
  return modelId?.toLowerCase().includes("opus") ?? false;
}

export function shouldWarnForModelSelection(
  modelId: string,
  previousModelId: string | undefined,
  source: ModelSelectionSource,
): boolean {
  return (
    (source === "set" || source === "cycle") &&
    isOpusModelId(modelId) &&
    !isOpusModelId(previousModelId)
  );
}

export function shouldWarnForSessionStart(
  reason: SessionStartReason,
  modelId: string | undefined,
): boolean {
  return (
    (reason === "startup" || reason === "new" || reason === "resume" || reason === "fork") &&
    isOpusModelId(modelId)
  );
}
