export interface RepositorySnapshot {
  branch: string;
  status: string;
  stagedDiff: string;
  unstagedDiff: string;
  recentCommits: string;
}

export interface GitRepositoryPort {
  isRepository(): Promise<boolean>;
  originUrl(): Promise<string | null>;
  snapshot(): Promise<RepositorySnapshot>;
  refExists(ref: string): Promise<boolean>;
  diffAgainst(ref: string): Promise<string>;
}
