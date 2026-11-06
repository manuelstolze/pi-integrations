import type { GitMode } from "../../domain/git-mode.js";
import {
  type CommitInputCheckPort,
  type CommitStageDraft,
  type InputCheckResult,
  type PreparedCommitStageProposal,
  type PreparedRequestStageProposal,
  type PreparedStageProposal,
  type RequestInputCheckPort,
  type RequestStageDraft,
  type StageProposalDraft,
} from "../ports/stage-input-check-ports.js";

export type StageProposalFailureKind = "invalid-proposal" | "mode-disallowed" | "input-unverifiable";
export type StageProposalResult =
  | { ok: true; proposal: PreparedStageProposal }
  | { ok: false; kind: StageProposalFailureKind; reason: string };
export type StageCommandCheckResult = { allowed: true } | { allowed: false; reason: string };

export type PrepareStageProposalInput =
  | { mode: GitMode; draft: CommitStageDraft; inputChecks: CommitInputCheckPort }
  | { mode: GitMode; draft: RequestStageDraft; inputChecks: RequestInputCheckPort };

export async function prepareStageProposal(input: PrepareStageProposalInput): Promise<StageProposalResult> {
  return isCommitPreparation(input)
    ? prepareCommitStage(input)
    : prepareRequestStage(input);
}

async function prepareCommitStage(
  input: Extract<PrepareStageProposalInput, { draft: CommitStageDraft }>,
): Promise<StageProposalResult> {
  if (input.mode === "request") {
    return { ok: false, kind: "mode-disallowed", reason: "The commit stage is not allowed in request mode." };
  }
  const invalidReason = validateDraft(input.draft);
  if (invalidReason) return { ok: false, kind: "invalid-proposal", reason: invalidReason };

  try {
    const result = await input.inputChecks.prepare(input.draft);
    if (!result.ok) return { ok: false, kind: "input-unverifiable", reason: result.reason };
    const invalidPreparedProposal = validatePreparedCommitProposal(input.draft, result.proposal);
    return invalidPreparedProposal
      ? { ok: false, kind: "invalid-proposal", reason: invalidPreparedProposal }
      : { ok: true, proposal: result.proposal };
  } catch (error) {
    return {
      ok: false,
      kind: "input-unverifiable",
      reason: error instanceof Error ? error.message : "Could not check the commit inputs.",
    };
  }
}

async function prepareRequestStage(
  input: Extract<PrepareStageProposalInput, { draft: RequestStageDraft }>,
): Promise<StageProposalResult> {
  if (input.mode === "commit") {
    return { ok: false, kind: "mode-disallowed", reason: "The request stage is not allowed in commit mode." };
  }
  const invalidReason = validateDraft(input.draft);
  if (invalidReason) return { ok: false, kind: "invalid-proposal", reason: invalidReason };

  try {
    const result = await input.inputChecks.prepare(input.draft);
    if (!result.ok) return { ok: false, kind: "input-unverifiable", reason: result.reason };
    const invalidPreparedProposal = validatePreparedRequestProposal(input.draft, result.proposal);
    return invalidPreparedProposal
      ? { ok: false, kind: "invalid-proposal", reason: invalidPreparedProposal }
      : { ok: true, proposal: result.proposal };
  } catch (error) {
    return {
      ok: false,
      kind: "input-unverifiable",
      reason: error instanceof Error ? error.message : "Could not check the request inputs",
    };
  }
}

export type CheckStageCommandInput =
  | {
      mode: GitMode;
      proposal: PreparedCommitStageProposal;
      commandIndex: number;
      command: string;
      inputChecks: CommitInputCheckPort;
    }
  | {
      mode: GitMode;
      proposal: PreparedRequestStageProposal;
      commandIndex: number;
      command: string;
      inputChecks: RequestInputCheckPort;
    };

export async function checkStageCommandInput(input: CheckStageCommandInput): Promise<StageCommandCheckResult> {
  if (!Number.isInteger(input.commandIndex) || input.commandIndex < 0 || !input.command.trim()) {
    return { allowed: false, reason: "The command proposal is invalid." };
  }
  if (!isAllowedStage(input.mode, input.proposal.stage)) {
    return { allowed: false, reason: `The ${input.proposal.stage} stage is not allowed in ${input.mode} mode.` };
  }

  try {
    if (isCommitCommandCheck(input)) {
      const commit = input.proposal.commits[input.commandIndex];
      if (!commit) return { allowed: false, reason: "The commit command is not in the proposal." };
      if (input.command !== commit.command) return { allowed: false, reason: "The command does not match the proposal." };
      const result = await input.inputChecks.verify(input.proposal, input.commandIndex);
      return result.ok ? { allowed: true } : { allowed: false, reason: result.reason };
    }

    const requestCommand = input.proposal.commands[input.commandIndex];
    if (!requestCommand) return { allowed: false, reason: "The request command is not in the proposal." };
    if (input.command !== requestCommand.command) return { allowed: false, reason: "The command does not match the proposal." };
    const result = await input.inputChecks.verify(input.proposal, requestCommand.action);
    return result.ok ? { allowed: true } : { allowed: false, reason: result.reason };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "Could not verify the command inputs.",
    };
  }
}

function isCommitPreparation(input: PrepareStageProposalInput): input is Extract<PrepareStageProposalInput, { draft: CommitStageDraft }> {
  return input.draft.stage === "commit";
}

function isCommitCommandCheck(input: CheckStageCommandInput): input is Extract<CheckStageCommandInput, { proposal: PreparedCommitStageProposal }> {
  return input.proposal.stage === "commit";
}

function isAllowedStage(mode: GitMode, stage: StageProposalDraft["stage"]): boolean {
  return stage === "commit" ? mode !== "request" : mode !== "commit";
}

function validateDraft(draft: StageProposalDraft): string | undefined {
  if (draft.stage === "commit") {
    if (draft.commits.length === 0) return "A commit proposal needs at least one commit.";
    for (const [index, commit] of draft.commits.entries()) {
      if (!commit.message.trim()) return `Commit ${index + 1} needs a message.`;
      if (commit.files.length === 0 || commit.files.some((file) => !file.trim())) {
        return `Commit ${index + 1} needs explicit file paths.`;
      }
    }
    return undefined;
  }

  if (!draft.sourceBranch.trim() || !draft.targetBranch.trim()) return "The request needs explicit source and target branches.";
  if (!draft.title.trim() || !draft.description.trim()) return "The request needs a title and description.";
  if (draft.descriptionInput.kind === "file"
    && (!draft.descriptionInput.path.trim() || !draft.descriptionInput.contentBase64.trim())) {
    return "A file-based description needs an explicit path and approved file bytes.";
  }
  return undefined;
}

function validatePreparedCommitProposal(
  draft: CommitStageDraft,
  proposal: PreparedCommitStageProposal,
): string | undefined {
  if (proposal.stage !== "commit") return "The input checker returned a proposal for the wrong stage.";
  if (proposal.commits.length !== draft.commits.length) return "The prepared commit count does not match the proposal.";
  for (const [index, commit] of proposal.commits.entries()) {
    const source = draft.commits[index];
    if (commit.message !== source.message || !sameStrings(commit.files, source.files)) {
      return `Prepared commit ${index + 1} does not match the proposal.`;
    }
    if (!commit.command.trim() || !commit.inputSnapshot.trim()) {
      return `Prepared commit ${index + 1} is missing its command or input snapshot.`;
    }
  }
  return undefined;
}

function validatePreparedRequestProposal(
  draft: RequestStageDraft,
  proposal: PreparedRequestStageProposal,
): string | undefined {
  if (proposal.stage !== "request") return "The input checker returned a proposal for the wrong stage.";
  const pushAlreadyCompleted = draft.pushAlreadyCompleted === true;
  if (proposal.provider !== draft.provider || proposal.sourceBranch !== draft.sourceBranch
    || proposal.targetBranch !== draft.targetBranch || proposal.title !== draft.title
    || proposal.description !== draft.description || proposal.pushAlreadyCompleted !== pushAlreadyCompleted
    || !sameDescriptionInput(proposal.descriptionInput, draft.descriptionInput)) {
    return "The prepared request does not match the proposal.";
  }
  const expectedActions = pushAlreadyCompleted ? ["create"] : ["push", "create"];
  if (proposal.commands.length !== expectedActions.length
    || proposal.commands.some((command, index) => command.action !== expectedActions[index]
      || !command.command.trim() || !command.inputSnapshot.trim())) {
    return "The prepared request needs ordered remaining commands with checked inputs.";
  }
  return undefined;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameDescriptionInput(left: RequestStageDraft["descriptionInput"], right: RequestStageDraft["descriptionInput"]): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "inline") return true;
  return right.kind === "file" && left.path === right.path && left.contentBase64 === right.contentBase64;
}
