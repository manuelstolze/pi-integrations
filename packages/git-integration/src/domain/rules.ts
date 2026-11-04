export const gitLabFallbackBranches = ["develop", "main", "master"] as const;

export function selectGitLabTargetBranch(available: readonly string[]): string | null {
  return gitLabFallbackBranches.find((branch) => available.includes(branch)) ?? null;
}
