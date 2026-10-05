import type { CommandPattern } from "../../domain/patterns.js";

export interface PermissionGateConfiguration {
  applyBuiltinDefaults?: boolean;
  dangerousPatterns?: CommandPattern[];
  allowedPatterns?: CommandPattern[];
}

export interface PermissionConfigLoadResult {
  configuration: PermissionGateConfiguration;
  error?: Error;
}

export interface PermissionConfigPort {
  load(): PermissionConfigLoadResult;
  saveExactAllowRule(command: string): CommandPattern;
}
