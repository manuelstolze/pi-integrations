export type HeraldErrorCode =
  | "invalid-mode"
  | "not-repository"
  | "missing-origin"
  | "provider-unavailable"
  | "context-failed";

export class HeraldError extends Error {
  readonly code: HeraldErrorCode;

  constructor(code: HeraldErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HeraldError";
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
