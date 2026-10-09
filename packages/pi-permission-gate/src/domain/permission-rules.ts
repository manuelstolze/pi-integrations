import { findCommandPattern, type CommandPattern } from "./patterns.js";

export interface AutoDenyRule {
  pattern: string;
  reason: string;
}

export const AUTO_DENY_RULES: AutoDenyRule[] = [
  { pattern: "az group delete", reason: "deletes an entire Azure resource group and all its resources" },
  { pattern: "az subscription cancel", reason: "cancels the entire Azure subscription" },
  { pattern: "az account management-group delete", reason: "deletes Azure management group hierarchy" },
  { pattern: "az ad user delete", reason: "deletes an Azure AD user" },
  { pattern: "az ad group delete", reason: "deletes an Azure AD security group" },
  { pattern: "az lock delete", reason: "removes an Azure resource lock (enables further destruction)" },
  { pattern: "az keyvault purge", reason: "permanently purges a Key Vault, bypassing soft-delete" },
  { pattern: "kubectl delete namespace", reason: "deletes a Kubernetes namespace and all resources inside" },
  { pattern: "kubectl delete --all", reason: "deletes all Kubernetes resources of a type" },
  { pattern: "kubectl drain", reason: "evicts all pods from a Kubernetes node" },
];

export const BUILTIN_DANGEROUS_PATTERNS: CommandPattern[] = [
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

export type CommandEvaluation =
  | { kind: "auto-deny"; rule: AutoDenyRule }
  | { kind: "allow" }
  | { kind: "requires-approval"; pattern: CommandPattern };

export function evaluateCommand(
  command: string,
  sessionAllowed: boolean,
  allowedPatterns: CommandPattern[],
  dangerousPatterns: CommandPattern[],
): CommandEvaluation {
  const autoDenyRule = AUTO_DENY_RULES.find((rule) => command.includes(rule.pattern));
  if (autoDenyRule) return { kind: "auto-deny", rule: autoDenyRule };

  if (sessionAllowed || findCommandPattern(command, allowedPatterns)) return { kind: "allow" };

  const dangerousPattern = findCommandPattern(command, dangerousPatterns);
  return dangerousPattern
    ? { kind: "requires-approval", pattern: dangerousPattern }
    : { kind: "allow" };
}
