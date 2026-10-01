import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PatternConfig {
  pattern: string;
  regex?: boolean;
  description?: string;
}

export interface GuardrailsConfig {
  applyBuiltinDefaults?: boolean;
  permissionGate?: {
    patterns?: PatternConfig[];
    allowedPatterns?: PatternConfig[];
  };
}

export const BUILTIN_PATTERNS: PatternConfig[] = [
  { pattern: "rm -rf", description: "recursive force delete" },
  { pattern: "sudo", description: "superuser command" },
  { pattern: "dd of=", description: "disk write operation" },
  { pattern: "mkfs.", description: "filesystem format" },
  { pattern: "chmod -R 777", description: "insecure recursive permissions" },
  { pattern: "chown -R", description: "recursive ownership change" },
  { pattern: "doas", description: "privileged command execution" },
  { pattern: "pkexec", description: "privileged command execution" },
  { pattern: "shred", description: "secure file overwrite" },
  { pattern: "wipefs", description: "filesystem signature wipe" },
  { pattern: "blkdiscard", description: "block device discard" },
  { pattern: "fdisk", description: "disk partitioning" },
  { pattern: "parted", description: "disk partitioning" },
  { pattern: "docker run --privileged", description: "container with privileged mode" },
];

export function getConfigPath(): string {
  return join(homedir(), ".pi", "agent", "extensions", "guardrails.json");
}

export function readConfig(path = getConfigPath()): { config: GuardrailsConfig; error?: Error } {
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

export function writeExactAllowRule(command: string, path = getConfigPath()): PatternConfig {
  const { config, error } = readConfig(path);
  if (error) throw new Error(`Cannot update invalid guardrails config: ${error.message}`);

  const permissionGate = config.permissionGate ?? {};
  const allowedPatterns = permissionGate.allowedPatterns ?? [];
  const rule: PatternConfig = { pattern: `^${escapeRegex(command)}$`, regex: true };
  if (!allowedPatterns.some((item) => item.pattern === rule.pattern && item.regex === true)) {
    allowedPatterns.push(rule);
  }

  config.permissionGate = { ...permissionGate, allowedPatterns };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return rule;
}

export function testPattern(pattern: PatternConfig, command: string): boolean {
  if (pattern.regex) {
    try {
      return new RegExp(pattern.pattern).test(command);
    } catch {
      return false;
    }
  }
  return command.includes(pattern.pattern);
}

export function findPattern(command: string, patterns: PatternConfig[]): PatternConfig | undefined {
  return patterns.find((pattern) => testPattern(pattern, command));
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
  if (value === undefined) return true;
  return Array.isArray(value) && value.every(isPatternConfig);
}

function isPatternConfig(value: unknown): value is PatternConfig {
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
