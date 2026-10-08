export type JiraErrorCode =
  | "invalid-input"
  | "missing-cli"
  | "authentication-required"
  | "authentication-failed"
  | "command-failed"
  | "timeout"
  | "invalid-json"
  | "invalid-response";

export class JiraToolError extends Error {
  readonly code: JiraErrorCode;

  constructor(code: JiraErrorCode, message: string) {
    super(message);
    this.name = "JiraToolError";
    this.code = code;
  }
}
