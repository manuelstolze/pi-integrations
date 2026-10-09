import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PermissionConfigLoadResult, PermissionConfigPort } from "../../application/ports/permission-config-port.js";
import type { CommandPattern } from "../../domain/patterns.js";

interface GuardrailsConfig {
  applyBuiltinDefaults?: boolean;
  permissionGate?: {
    patterns?: CommandPattern[];
    allowedPatterns?: CommandPattern[];
  };
}

export function getConfigPath(): string {
  return join(homedir(), ".pi", "agent", "extensions", "guardrails.json");
}

export class FilePermissionConfigAdapter implements PermissionConfigPort {
  constructor(private readonly path = getConfigPath()) {}

  load(): PermissionConfigLoadResult {
    const result = readStoredConfig(this.path);
    if (result.error) return { configuration: {}, error: result.error };

    return {
      configuration: {
        applyBuiltinDefaults: result.config.applyBuiltinDefaults,
        dangerousPatterns: result.config.permissionGate?.patterns,
        allowedPatterns: result.config.permissionGate?.allowedPatterns,
      },
    };
  }

  saveExactAllowRule(command: string): CommandPattern {
    const result = readStoredConfig(this.path);
    if (result.error) {
      throw new Error(`Cannot update invalid guardrails config: ${result.error.message}`);
    }

    const config = result.config;
    const permissionGate = config.permissionGate ?? {};
    const allowedPatterns = permissionGate.allowedPatterns ?? [];
    const rule: CommandPattern = { pattern: `^${escapeRegex(command)}$`, regex: true };

    if (!allowedPatterns.some((item) => item.pattern === rule.pattern && item.regex === true)) {
      allowedPatterns.push(rule);
    }

    config.permissionGate = { ...permissionGate, allowedPatterns };
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    return rule;
  }
}

function readStoredConfig(path: string): { config: GuardrailsConfig; error?: Error } {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { config: {} };
    return { config: {}, error: asError(error) };
  }

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isGuardrailsConfig(parsed)) throw new Error("guardrails.json has an invalid structure");
    return { config: parsed };
  } catch (error) {
    return { config: {}, error: asError(error) };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGuardrailsConfig(value: unknown): value is GuardrailsConfig {
  if (!isRecord(value)) return false;
  if (value.applyBuiltinDefaults !== undefined && typeof value.applyBuiltinDefaults !== "boolean") return false;
  if (value.permissionGate === undefined) return true;
  if (!isRecord(value.permissionGate)) return false;
  return isPatternList(value.permissionGate.patterns) && isPatternList(value.permissionGate.allowedPatterns);
}

function isPatternList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isPatternConfig));
}

function isPatternConfig(value: unknown): value is CommandPattern {
  return (
    isRecord(value) &&
    typeof value.pattern === "string" &&
    (value.regex === undefined || typeof value.regex === "boolean") &&
    (value.description === undefined || typeof value.description === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
