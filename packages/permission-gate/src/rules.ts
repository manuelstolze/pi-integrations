export interface AutoDenyRule {
  pattern: string;
  reason: string;
}

export const AUTO_DENY_PATTERNS: AutoDenyRule[] = [
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

export function findAutoDenyMatch(command: string): AutoDenyRule | undefined {
  return AUTO_DENY_PATTERNS.find((rule) => command.includes(rule.pattern));
}
