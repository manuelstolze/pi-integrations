import { requireAdf } from "../../domain/adf-validation.js";
import { equalJson, issueKey, validateUpdateInput, type DescriptionProposal, type UpdateResult } from "../../domain/description-update.js";
import type { JiraDescriptionPort } from "../ports/jira-description-port.js";
import type { DescriptionProposalPort } from "../ports/description-proposal-port.js";

export function createDescriptionUpdates(jira: JiraDescriptionPort, proposals: DescriptionProposalPort) {
  let queue = Promise.resolve();
  const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error("Update cancelled before writing."); };
  const record = (id: string, result: UpdateResult): UpdateResult => {
    try { proposals.record(id, result); }
    catch { result.recordError = "The result could not be recorded in the Pi session. Do not retry the write."; }
    return result;
  };
  async function apply(id: string, signal?: AbortSignal): Promise<UpdateResult> {
    cancelled(signal);
    // Consuming approval also records it. Failure must prevent submission.
    const proposal = proposals.consume(id);
    if (!proposal) return { status: "approval-required", proposalId: id, writeAttempted: false, proposal: proposals.find(id) };
    const base = { proposalId: id, issueKey: proposal.snapshot.issue.key, site: proposal.snapshot.target.site, writeAttempted: false };
    const approvalSignal = proposals.submissionSignal(id);
    const submissionSignal = signal ? AbortSignal.any([signal, approvalSignal]) : approvalSignal;
    try {
      const current = await jira.readDescription(base.issueKey, submissionSignal, false);
      if (!equalJson(current.target, proposal.snapshot.target) || current.issue.key !== base.issueKey || !equalJson(current.descriptionDocument, proposal.snapshot.descriptionDocument)) {
        return record(id, { ...base, status: "conflict", error: "The target or description changed. Prepare a new proposal." });
      }
      cancelled(submissionSignal);
      if (!proposals.canSubmit(id)) return record(id, { ...base, status: "cancelled-before-write", error: "The proposal was cancelled or its conversation changed before submission." });
    } catch (error) {
      return record(id, { ...base, status: submissionSignal.aborted ? "cancelled-before-write" : "rejected", error: safeError(error) });
    }
    // The port may fail after spawning a process. Treat all submission failures as potentially written.
    const result: UpdateResult = { ...base, writeAttempted: true, status: "unknown" };
    try { proposals.record(id, result, "intent"); }
    catch { return { ...base, status: "rejected", error: "The submission intent could not be recorded. No write was attempted." }; }
    try { Object.assign(result, await jira.replaceDescription(proposal, submissionSignal)); }
    catch (error) { result.error = safeError(error); }
    if (!result.writeAttempted) {
      result.status = submissionSignal.aborted ? "cancelled-before-write" : "rejected";
      return record(id, result);
    }
    try {
      const saved = await jira.readDescription(base.issueKey, AbortSignal.timeout(30_000), false);
      if (!equalJson(saved.target, proposal.snapshot.target) || saved.issue.key !== base.issueKey) throw new Error("Verification target changed.");
      result.status = equalJson(saved.descriptionDocument, proposal.description) ? "verified"
        : equalJson(saved.descriptionDocument, proposal.snapshot.descriptionDocument) ? "unchanged" : "different";
    } catch { result.status = "unknown"; }
    return record(id, result);
  }
  return {
    async execute(input: unknown, signal?: AbortSignal): Promise<UpdateResult> {
      validateUpdateInput(input);
      cancelled(signal);
      if (input.action === "prepare") {
        const replacement = requireAdf(input.description);
        const snapshot = await jira.readDescription(issueKey(input.issueKey), signal, true);
        if (snapshot.issue.key !== input.issueKey) throw new Error("Jira returned a different issue key.");
        cancelled(signal);
        const proposal: DescriptionProposal = proposals.create(snapshot, replacement);
        return { status: "pending-approval", proposalId: proposal.id, issueKey: snapshot.issue.key, site: snapshot.target.site, writeAttempted: false, proposal };
      }
      const job = queue.then(() => apply(input.proposalId, signal));
      queue = job.then(() => undefined, () => undefined);
      return job;
    },
  };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "The Jira operation failed.";
}
