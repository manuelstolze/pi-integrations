import { BUILTIN_DANGEROUS_PATTERNS, evaluateCommand } from "../../domain/permission-rules.js";
import type { CommandPattern } from "../../domain/patterns.js";
import type { PermissionApprovalPort } from "../ports/permission-approval-port.js";
import type { PermissionConfigPort } from "../ports/permission-config-port.js";
import type { SessionApprovalsPort } from "../ports/session-approvals-port.js";

export type PermissionGateOutcome =
  | { kind: "allow" }
  | { kind: "allow-forever"; command: string }
  | { kind: "auto-deny"; pattern: string; reason: string }
  | { kind: "approval-unavailable"; description: string }
  | { kind: "user-deny"; instruction?: string }
  | { kind: "permanent-allow-failed"; error: Error };

export interface PermissionGate {
  startSession(): Error | undefined;
  handleCommand(command: string, approval: PermissionApprovalPort): Promise<PermissionGateOutcome>;
}

export function createPermissionGate(
  config: PermissionConfigPort,
  sessionApprovals: SessionApprovalsPort,
): PermissionGate {
  let allowedPatterns: CommandPattern[] = [];
  let dangerousPatterns: CommandPattern[] = [];

  function startSession(): Error | undefined {
    sessionApprovals.clear();
    const result = config.load();
    const settings = result.error ? {} : result.configuration;
    const applyBuiltinDefaults = settings.applyBuiltinDefaults !== false;

    dangerousPatterns = applyBuiltinDefaults
      ? [...(settings.dangerousPatterns ?? []), ...BUILTIN_DANGEROUS_PATTERNS]
      : (settings.dangerousPatterns ?? []);
    allowedPatterns = settings.allowedPatterns ?? [];

    return result.error;
  }

  async function handleCommand(
    command: string,
    approval: PermissionApprovalPort,
  ): Promise<PermissionGateOutcome> {
    const evaluation = evaluateCommand(
      command,
      sessionApprovals.has(command),
      allowedPatterns,
      dangerousPatterns,
    );

    if (evaluation.kind === "auto-deny") {
      return {
        kind: "auto-deny",
        pattern: evaluation.rule.pattern,
        reason: evaluation.rule.reason,
      };
    }

    if (evaluation.kind === "allow") return { kind: "allow" };

    const description = evaluation.pattern.description ?? evaluation.pattern.pattern;
    const result = await approval.request(command, description);

    if (result.kind === "unavailable") {
      return { kind: "approval-unavailable", description };
    }
    if (result.kind === "allow-once") return { kind: "allow" };
    if (result.kind === "allow-session") {
      sessionApprovals.allow(command);
      return { kind: "allow" };
    }
    if (result.kind === "allow-forever") {
      try {
        const rule = config.saveExactAllowRule(command);
        if (!allowedPatterns.some((item) => item.pattern === rule.pattern && item.regex === true)) {
          allowedPatterns.push(rule);
        }
        return { kind: "allow-forever", command };
      } catch (error) {
        return {
          kind: "permanent-allow-failed",
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }

    const instruction = result.instruction?.trim();
    return instruction ? { kind: "user-deny", instruction } : { kind: "user-deny" };
  }

  return { startSession, handleCommand };
}
