import { describe, expect, it } from "vitest";
import { providerHintFromOriginUrl } from "../src/domain/hosting-provider.js";
import { selectGitLabTargetBranch } from "../src/domain/rules.js";
import {
  assessUserReply, completeStage, createStageApprovalState, finishCommandAttempt,
  invalidateStageApproval, markProposalDisplayed, proposeStage, recordUserReply,
  reserveCommandAttempt, type ProposalIdentity, type StageApprovalState, type StageProposal,
} from "../src/domain/stage-approval.js";

describe("providerHintFromOriginUrl", () => {
  it("detects GitHub HTTPS and SSH origins", () => {
    expect(providerHintFromOriginUrl("https://github.com/owner/repo.git")).toBe("github");
    expect(providerHintFromOriginUrl("git@github.com:owner/repo.git")).toBe("github");
  });

  it("does not guess a provider for another host", () => {
    expect(providerHintFromOriginUrl("git@gitlab.example.com:group/repo.git")).toBeNull();
    expect(providerHintFromOriginUrl("https://code.example.com/group/repo.git")).toBeNull();
  });
});

describe("selectGitLabTargetBranch", () => {
  it.each([
    [[], null],
    [["master"], "master"],
    [["main"], "main"],
    [["main", "master"], "main"],
    [["develop"], "develop"],
    [["develop", "master"], "develop"],
    [["develop", "main"], "develop"],
    [["develop", "main", "master"], "develop"],
  ])("selects the first available branch from %o", (available, expected) => {
    expect(selectGitLabTargetBranch(available)).toBe(expected);
  });
});

const runId = "run-1";
const sessionId = "session-1";
const proposalIdentity: ProposalIdentity = { proposalId: "proposal-1", runId, sessionId };

function proposal(proposalId: string, commands: readonly string[]): StageProposal {
  return { proposalId, runId, sessionId, stage: "commit", commands };
}

function approvedState(commands: readonly string[] = ["git commit -m first"]): StageApprovalState {
  let state = proposeStage(createStageApprovalState(runId, sessionId), proposal("proposal-1", commands));
  if (!state) throw new Error("Test proposal was not accepted");
  state = markProposalDisplayed(state, proposalIdentity);
  if (!state) throw new Error("Test proposal was not marked as displayed");
  state = recordUserReply(state, {
    ...proposalIdentity, replyId: "reply-1", source: "interactive", text: "Yes, approve the proposal.",
  });
  if (!state) throw new Error("Test human reply was not recorded");
  return assessUserReply(state, { ...proposalIdentity, replyId: "reply-1", assessment: "unconditional-approval" });
}

describe("stage approval rules", () => {
  it("binds proposals and later human replies to one run and session", () => {
    const initial = createStageApprovalState(runId, sessionId);
    expect(() => createStageApprovalState("", sessionId)).toThrow("run ID and session ID");
    expect(proposeStage(initial, { ...proposal("bad-run", ["commit"]), runId: "other-run" })).toBeUndefined();
    expect(proposeStage(initial, proposal("empty-command", [""]))).toBeUndefined();

    const active = proposeStage(initial, proposal("proposal-1", ["git commit -m first"]));
    expect(active?.approved).toBe(false);
    expect(markProposalDisplayed(active!, { ...proposalIdentity, sessionId: "other-session" })).toBeUndefined();
    expect(recordUserReply(active!, {
      ...proposalIdentity, replyId: "early", source: "interactive", text: "Yes",
    })).toBeUndefined();
    const displayed = markProposalDisplayed(active!, proposalIdentity)!;
    expect(recordUserReply(displayed, {
      ...proposalIdentity, replyId: "extension", source: "extension", text: "Yes",
    })).toBeUndefined();
    expect(recordUserReply(displayed, {
      ...proposalIdentity, sessionId: "other-session", replyId: "stale", source: "rpc", text: "Yes",
    })).toBeUndefined();

    const reply = recordUserReply(displayed, {
      ...proposalIdentity, replyId: "reply-1", source: "rpc", text: "Yes, approve the proposal.",
    });
    expect(reply?.reply).toMatchObject({ replyId: "reply-1", source: "rpc", sessionId });
    expect(reply?.approved).toBe(false);
  });

  it("requires a current model report for a recorded reply but does not claim independent interpretation", () => {
    let state = approvedState();
    expect(state.approved).toBe(true);
    expect(assessUserReply(state, {
      ...proposalIdentity, replyId: "stale-reply", assessment: "unconditional-approval",
    })).toBe(state);

    const assessments = ["denial", "conditional", "unclear"] as const;
    for (const [index, assessment] of assessments.entries()) {
      const replyId = `reply-${index + 2}`;
      state = recordUserReply(state, {
        ...proposalIdentity, replyId, source: "interactive", text: "Review this change.",
      })!;
      state = assessUserReply(state, { ...proposalIdentity, replyId, assessment });
      expect(state.approved).toBe(false);
      expect(assessUserReply(state, { ...proposalIdentity, replyId, assessment: "unconditional-approval" })).toBe(state);
      expect(state.approved).toBe(false);
    }

    state = recordUserReply(state, {
      ...proposalIdentity, replyId: "empty-reply", source: "interactive", text: "  ",
    })!;
    state = assessUserReply(state, {
      ...proposalIdentity, replyId: "empty-reply", assessment: "unconditional-approval",
    });
    expect(state.approved).toBe(false);
  });

  it("reserves commands in order and permits one attempt for each proposal command", () => {
    let state = approvedState(["git commit -m first", "git commit -m second"]);
    expect(reserveCommandAttempt(state, proposalIdentity, 1, "git commit -m second")).toBeUndefined();
    expect(reserveCommandAttempt(state, proposalIdentity, 0, "git commit -m altered")).toBeUndefined();

    state = reserveCommandAttempt(state, proposalIdentity, 0, "git commit -m first")!;
    expect(reserveCommandAttempt(state, proposalIdentity, 0, "git commit -m first")).toBeUndefined();
    expect(reserveCommandAttempt(state, proposalIdentity, 1, "git commit -m second")).toBeUndefined();
    expect(proposeStage(state, proposal("replacement-while-running", ["git commit -m second"]))).toBeUndefined();

    state = finishCommandAttempt(state, proposalIdentity, 0, "git commit -m first", true)!;
    expect(state.completedCommands).toEqual([{
      proposalId: "proposal-1", stage: "commit", index: 0, command: "git commit -m first",
    }]);
    expect(reserveCommandAttempt(state, proposalIdentity, 0, "git commit -m first")).toBeUndefined();

    state = reserveCommandAttempt(state, proposalIdentity, 1, "git commit -m second")!;
    state = finishCommandAttempt(state, proposalIdentity, 1, "git commit -m second", false)!;
    expect(state.approved).toBe(false);
    expect(state.reply).toBeUndefined();
    expect(reserveCommandAttempt(state, proposalIdentity, 1, "git commit -m second")).toBeUndefined();

    const replacementIdentity: ProposalIdentity = { proposalId: "proposal-2", runId, sessionId };
    expect(proposeStage(state, proposal("proposal-2", ["git commit -m first", "git commit -m remaining"]))).toBeUndefined();
    state = proposeStage(state, proposal("proposal-2", ["git commit -m remaining"]))!;
    expect(state.completedCommands).toHaveLength(1);
    expect(state.approved).toBe(false);
    expect(reserveCommandAttempt(state, replacementIdentity, 0, "git commit -m remaining")).toBeUndefined();
    state = markProposalDisplayed(state, replacementIdentity)!;
    state = recordUserReply(state, {
      ...replacementIdentity, replyId: "reply-2", source: "interactive", text: "Yes, approve the remaining work.",
    })!;
    state = assessUserReply(state, {
      ...replacementIdentity, replyId: "reply-2", assessment: "unconditional-approval",
    });
    expect(reserveCommandAttempt(state, replacementIdentity, 0, "git commit -m remaining")).toBeDefined();
  });

  it("expires approval at stage completion and on invalidation", () => {
    let state = approvedState();
    state = reserveCommandAttempt(state, proposalIdentity, 0, "git commit -m first")!;
    state = finishCommandAttempt(state, proposalIdentity, 0, "git commit -m first", true)!;
    state = completeStage(state, proposalIdentity)!;
    expect(state.stageCompleted).toBe(true);
    expect(state.approved).toBe(false);
    expect(state.reply).toBeUndefined();
    expect(markProposalDisplayed(state, proposalIdentity)).toBeUndefined();
    expect(proposeStage(state, proposal("later", ["git push origin branch"]))).toBeUndefined();

    const invalidated = invalidateStageApproval(approvedState());
    expect(invalidated.proposal).toBeUndefined();
    expect(invalidated.reply).toBeUndefined();
    expect(invalidated.approved).toBe(false);
    expect(reserveCommandAttempt(invalidated, proposalIdentity, 0, "git commit -m first")).toBeUndefined();
    expect(proposeStage(invalidated, proposal("after-cancel", ["git commit -m first"]))).toBeUndefined();
  });
});
