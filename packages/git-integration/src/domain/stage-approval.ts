export type ApprovalStage = "commit" | "request";
export type ReplySource = "interactive" | "rpc" | "extension";
export type ReplyAssessment = "unconditional-approval" | "denial" | "conditional" | "unclear";
export type CommandAttemptStatus = "unused" | "running" | "succeeded" | "failed";

export interface ProposalIdentity {
  proposalId: string;
  runId: string;
  sessionId: string;
}

export interface StageProposal extends ProposalIdentity {
  stage: ApprovalStage;
  commands: readonly string[];
}

export interface UserReply extends ProposalIdentity {
  replyId: string;
  source: ReplySource;
  text: string;
}

export interface ReplyAssessmentReport extends ProposalIdentity {
  replyId: string;
  assessment: ReplyAssessment;
}

export interface CommandAttempt {
  index: number;
  command: string;
  status: CommandAttemptStatus;
}

export interface CompletedCommand {
  proposalId: string;
  stage: ApprovalStage;
  index: number;
  command: string;
}

export interface StageApprovalState {
  runId: string;
  sessionId: string;
  proposal?: StageProposal;
  proposalDisplayed: boolean;
  reply?: UserReply;
  assessment?: ReplyAssessment;
  approved: boolean;
  attempts: readonly CommandAttempt[];
  completedCommands: readonly CompletedCommand[];
  stageCompleted: boolean;
  invalidated: boolean;
}

/**
 * A model assessment is bound to an actual later human reply and the current
 * proposal. It remains the workflow model's interpretation, not independent
 * proof that the reply was unconditional.
 */
export function createStageApprovalState(runId: string, sessionId: string): StageApprovalState {
  if (!runId.trim() || !sessionId.trim()) {
    throw new Error("A stage approval needs a run ID and session ID.");
  }
  return {
    runId,
    sessionId,
    proposalDisplayed: false,
    approved: false,
    attempts: [],
    completedCommands: [],
    stageCompleted: false,
    invalidated: false,
  };
}

export function proposeStage(
  state: StageApprovalState,
  proposal: StageProposal,
): StageApprovalState | undefined {
  if (state.invalidated || state.stageCompleted || state.attempts.some((attempt) => attempt.status === "running")) return undefined;
  if (!proposal.proposalId.trim() || proposal.runId !== state.runId || proposal.sessionId !== state.sessionId) {
    return undefined;
  }
  if (state.proposal?.proposalId === proposal.proposalId) return undefined;
  if (proposal.commands.length === 0 || proposal.commands.some((command) => !command.trim())) return undefined;
  if (state.completedCommands.some((completed) => completed.stage === proposal.stage
    && proposal.commands.includes(completed.command))) return undefined;

  const accepted: StageProposal = { ...proposal, commands: [...proposal.commands] };
  return {
    ...state,
    proposal: accepted,
    proposalDisplayed: false,
    reply: undefined,
    assessment: undefined,
    approved: false,
    attempts: accepted.commands.map((command, index) => ({ index, command, status: "unused" })),
  };
}

export function markProposalDisplayed(
  state: StageApprovalState,
  identity: ProposalIdentity,
): StageApprovalState | undefined {
  if (!matchesProposal(state, identity) || state.stageCompleted || state.invalidated) return undefined;
  return { ...state, proposalDisplayed: true };
}

export function recordUserReply(state: StageApprovalState, reply: UserReply): StageApprovalState | undefined {
  if (!matchesProposal(state, reply) || !state.proposalDisplayed || state.stageCompleted || state.invalidated) {
    return undefined;
  }
  if (reply.source === "extension" || !reply.replyId.trim()) return undefined;

  return {
    ...state,
    reply: { ...reply },
    assessment: undefined,
    approved: false,
  };
}

export function assessUserReply(
  state: StageApprovalState,
  report: ReplyAssessmentReport,
): StageApprovalState {
  if (!matchesProposal(state, report) || !state.reply || state.assessment !== undefined
    || report.replyId !== state.reply.replyId || !state.proposalDisplayed || state.stageCompleted || state.invalidated) {
    return state;
  }

  const approved = report.assessment === "unconditional-approval" && state.reply.text.trim().length > 0;
  return { ...state, assessment: report.assessment, approved };
}

export function reserveCommandAttempt(
  state: StageApprovalState,
  identity: ProposalIdentity,
  index: number,
  command: string,
): StageApprovalState | undefined {
  if (!matchesProposal(state, identity) || !state.approved || state.stageCompleted || state.invalidated) {
    return undefined;
  }
  const attempt = state.attempts[index];
  if (!attempt || attempt.status !== "unused" || attempt.command !== command) return undefined;
  const nextIndex = state.attempts.findIndex((candidate) => candidate.status !== "succeeded");
  if (nextIndex !== index) return undefined;

  const attempts = state.attempts.map((candidate) => candidate.index === index
    ? { ...candidate, status: "running" as const }
    : candidate);
  return { ...state, attempts };
}

export function finishCommandAttempt(
  state: StageApprovalState,
  identity: ProposalIdentity,
  index: number,
  command: string,
  succeeded: boolean,
): StageApprovalState | undefined {
  if (!matchesProposal(state, identity) || state.stageCompleted || state.invalidated) return undefined;
  const attempt = state.attempts[index];
  if (!attempt || attempt.status !== "running" || attempt.command !== command) return undefined;

  const status: CommandAttemptStatus = succeeded ? "succeeded" : "failed";
  const attempts = state.attempts.map((candidate) => candidate.index === index
    ? { ...candidate, status }
    : candidate);
  const completedCommands = succeeded && state.proposal
    ? [...state.completedCommands, {
      proposalId: state.proposal.proposalId,
      stage: state.proposal.stage,
      index,
      command,
    }]
    : state.completedCommands;
  return {
    ...state,
    attempts,
    completedCommands,
    approved: succeeded && state.approved,
    reply: succeeded ? state.reply : undefined,
    assessment: succeeded ? state.assessment : undefined,
  };
}

export function completeStage(state: StageApprovalState, identity: ProposalIdentity): StageApprovalState | undefined {
  if (!matchesProposal(state, identity) || state.invalidated || state.stageCompleted
    || state.attempts.length === 0 || state.attempts.some((attempt) => attempt.status !== "succeeded")) {
    return undefined;
  }
  return {
    ...state,
    proposalDisplayed: false,
    reply: undefined,
    assessment: undefined,
    approved: false,
    stageCompleted: true,
  };
}

export function invalidateStageApproval(state: StageApprovalState): StageApprovalState {
  return {
    ...state,
    proposal: undefined,
    proposalDisplayed: false,
    reply: undefined,
    assessment: undefined,
    approved: false,
    attempts: [],
    stageCompleted: state.stageCompleted,
    invalidated: true,
  };
}

function matchesProposal(state: StageApprovalState, identity: ProposalIdentity): boolean {
  return !!state.proposal
    && identity.proposalId === state.proposal.proposalId
    && identity.runId === state.runId
    && identity.sessionId === state.sessionId
    && identity.runId === state.proposal.runId
    && identity.sessionId === state.proposal.sessionId;
}
