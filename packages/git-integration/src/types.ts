export type ProviderKind = "github" | "gitlab";
export type HeraldMode = "commit" | "request" | "both";
export type WorkflowStage = "commit-plan" | "request-plan" | "completed" | "cancelled" | "failed";

export interface HeraldOptions {
  mode: HeraldMode;
  provider?: ProviderKind;
  targetBranch?: string;
  template?: string;
  pushRemote?: string;
  targetRemote?: string;
  targetRepository?: string;
  allowDirty: boolean;
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
  host: string;
  repository: string;
}

export interface GitContext {
  branch: string;
  status: string;
  changedFiles: string[];
  stagedDiff: string;
  unstagedDiff: string;
  recentCommits: string;
  snapshot: string;
}

export interface CommitGroup {
  files: string[];
  message: string;
}

export interface ValidationResult {
  command: string;
  result: string;
  passed: boolean;
  required?: boolean;
}

export interface ExistingRequest {
  id: string;
  title: string;
  state: "open" | "closed" | "merged" | "unknown";
  url: string;
  targetBranch: string;
  sourceBranch: string;
}

export interface WorkflowState {
  options: HeraldOptions;
  stage: WorkflowStage;
  cwd: string;
  context: GitContext;
  provider?: ProviderKind;
  providerHost?: string;
  pushRemote?: RemoteInfo;
  targetRemote?: RemoteInfo;
  targetRepository?: string;
  targetBranch?: string;
  sourceHead?: string;
  targetHead?: string;
  commits: string[];
  lastError?: string;
}
