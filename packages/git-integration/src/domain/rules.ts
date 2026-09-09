export interface GitLabBranchAvailability {
  develop: boolean;
  main: boolean;
  master: boolean;
}

export function selectGitLabTargetBranch(available: GitLabBranchAvailability): string | null {
  if (available.develop) return "develop";
  if (available.main) return "main";
  if (available.master) return "master";
  return null;
}
