export type AcknowledgementResult = "acknowledged" | "cancelled" | "unavailable";

export interface WarningAcknowledger {
  requestAcknowledgement(): Promise<AcknowledgementResult>;
}
