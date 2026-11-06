import type { HostingProvider } from "../../domain/hosting-provider.js";

export type StageProposalDraft = CommitStageDraft | RequestStageDraft;

export interface CommitStageDraft {
  stage: "commit";
  commits: readonly {
    message: string;
    files: readonly string[];
  }[];
}

export type RequestDescriptionInput =
  | { kind: "inline" }
  | { kind: "file"; path: string; contentBase64: string };

export interface RequestStageDraft {
  stage: "request";
  provider: HostingProvider;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  descriptionInput: RequestDescriptionInput;
  /** True when a successful earlier command already pushed this source branch. */
  pushAlreadyCompleted?: boolean;
}

export interface PreparedCommitStageProposal {
  stage: "commit";
  commits: readonly {
    message: string;
    files: readonly string[];
    command: string;
    inputSnapshot: string;
  }[];
}

export interface PreparedRequestCommand {
  action: "push" | "create";
  command: string;
  inputSnapshot: string;
}

export interface PreparedRequestStageProposal {
  stage: "request";
  provider: HostingProvider;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  descriptionInput: RequestDescriptionInput;
  pushAlreadyCompleted: boolean;
  commands: readonly PreparedRequestCommand[];
}

export type PreparedStageProposal = PreparedCommitStageProposal | PreparedRequestStageProposal;
export type InputCheckResult = { ok: true } | { ok: false; reason: string };
export type ProposalPreparationResult<T> = { ok: true; proposal: T } | { ok: false; reason: string };

/** Git-specific proposal creation and approved-input checks. */
export interface CommitInputCheckPort {
  prepare(draft: CommitStageDraft): Promise<ProposalPreparationResult<PreparedCommitStageProposal>>;
  verify(proposal: PreparedCommitStageProposal, commitIndex: number): Promise<InputCheckResult>;
}

/** Hosting-specific request proposal creation and approved-input checks. */
export interface RequestInputCheckPort {
  prepare(draft: RequestStageDraft): Promise<ProposalPreparationResult<PreparedRequestStageProposal>>;
  verify(proposal: PreparedRequestStageProposal, action: "push" | "create"): Promise<InputCheckResult>;
}
