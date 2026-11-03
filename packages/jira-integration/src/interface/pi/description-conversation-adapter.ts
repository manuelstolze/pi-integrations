import { randomUUID } from "node:crypto";
import type { ExtensionContext, InputEvent, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { DescriptionProposalPort } from "../../application/ports/description-proposal-port.js";
import type { AdfDocument, DescriptionProposal, DescriptionSnapshot, UpdateResult } from "../../domain/description-update.js";

export const DESCRIPTION_RECORD = "jira-description-update";
type Context = Pick<ExtensionContext, "sessionManager">;
type Receipt = { proposalId: string; text: string; source: string; anchor: string };
type RecordData = { event: string; proposalId: string; proposal?: DescriptionProposal; [key: string]: unknown };

export class DescriptionConversationAdapter implements DescriptionProposalPort {
  private context?: Context;
  private receipt?: Receipt;
  private sessionId?: string;
  private activeAttempt?: string;
  private activeAbort?: AbortController;

  constructor(private readonly append: (type: string, data: unknown) => void) {}

  bind(context: Context): void {
    const id = context.sessionManager.getSessionId();
    if (this.sessionId !== id) this.reset();
    this.context = context;
    this.sessionId = id;
  }

  reset(): void {
    this.receipt = undefined;
    this.activeAttempt = undefined;
    this.activeAbort?.abort();
    this.activeAbort = undefined;
  }

  private manager() {
    if (!this.context) throw new Error("Jira proposal session is unavailable.");
    return this.context.sessionManager;
  }

  private data(entry: SessionEntry): RecordData | undefined {
    if (entry.type !== "custom" || entry.customType !== DESCRIPTION_RECORD || !entry.data || typeof entry.data !== "object") return undefined;
    return entry.data as RecordData;
  }

  private pending(): DescriptionProposal | undefined {
    const manager = this.manager();
    // External Jira effects are not undone by moving to another conversation branch.
    const consumed = new Set(manager.getEntries().map((entry) => this.data(entry))
      .filter((data) => data?.event === "consumed" || data?.event === "cancelled").map((data) => data!.proposalId));
    const latest = manager.getBranch().map((entry) => this.data(entry)).filter((data) => data?.event === "proposal").at(-1)?.proposal;
    if (!latest || latest.sessionId !== manager.getSessionId() || consumed.has(latest.id)) return undefined;
    return latest;
  }

  private published(proposalId: string): boolean {
    return this.manager().getBranch().some((entry) => {
      if (entry.type !== "message" || entry.message.role !== "toolResult" || entry.message.toolName !== "jira_update_description" || entry.message.isError) return false;
      const details = entry.message.details as UpdateResult | undefined;
      return (details?.status === "pending-approval" || details?.status === "approval-required") && details.proposalId === proposalId && details.proposal?.id === proposalId;
    });
  }

  create(snapshot: DescriptionSnapshot, description: AdfDocument): DescriptionProposal {
    const proposal: DescriptionProposal = structuredClone({
      id: randomUUID(), sessionId: this.manager().getSessionId(), description,
      snapshot: { target: snapshot.target, issue: { key: snapshot.issue.key }, descriptionDocument: snapshot.descriptionDocument },
    });
    this.reset();
    this.append(DESCRIPTION_RECORD, { event: "proposal", proposalId: proposal.id, proposal });
    return structuredClone(proposal);
  }

  input(event: InputEvent, context: Context): void {
    this.bind(context);
    if (event.source === "extension") return;
    this.receipt = undefined;
    const latest = this.manager().getBranch().map((entry) => this.data(entry)).filter((data) => data?.event === "proposal").at(-1)?.proposal;
    const text = event.text.trim().toLowerCase();
    if (latest?.sessionId === this.manager().getSessionId() && text === `cancel jira update ${latest.id}` && this.published(latest.id)) {
      this.reset();
      this.append(DESCRIPTION_RECORD, { event: "cancelled", proposalId: latest.id, text: event.text, source: event.source });
      return;
    }
    const proposal = this.pending();
    if (!proposal || !this.published(proposal.id) || text !== `approve jira update ${proposal.id}`) return;
    const anchor = this.manager().getLeafId();
    if (!anchor) return;
    this.append(DESCRIPTION_RECORD, { event: "approval-receipt", proposalId: proposal.id, text: event.text, source: event.source });
    this.receipt = { proposalId: proposal.id, text: event.text, source: event.source, anchor };
  }

  find(proposalId: string): DescriptionProposal | undefined {
    const proposal = this.pending();
    return proposal?.id === proposalId ? structuredClone(proposal) : undefined;
  }

  consume(proposalId: string): DescriptionProposal | undefined {
    const proposal = this.pending();
    const receipt = this.receipt;
    if (!proposal || proposal.id !== proposalId || receipt?.proposalId !== proposalId || !this.published(proposalId)) return undefined;
    const branch = this.manager().getBranch();
    const anchorIndex = branch.findIndex((entry) => entry.id === receipt.anchor);
    if (anchorIndex < 0) return undefined;
    const messages = branch.slice(anchorIndex + 1).filter((entry) => entry.type === "message" && entry.message.role === "user");
    if (messages.length !== 1) return undefined;
    const entry = messages[0]!;
    if (entry.type !== "message" || entry.message.role !== "user") return undefined;
    const content = entry.message.content;
    const text = typeof content === "string" ? content : content.length === 1 && content[0]?.type === "text" ? content[0].text : undefined;
    if (text !== receipt.text) return undefined;
    this.receipt = undefined;
    this.append(DESCRIPTION_RECORD, { event: "consumed", proposalId, approval: { text, source: receipt.source, userEntryId: entry.id } });
    this.activeAttempt = proposalId;
    this.activeAbort = new AbortController();
    return structuredClone(proposal);
  }

  canSubmit(proposalId: string): boolean {
    return this.activeAttempt === proposalId;
  }

  submissionSignal(proposalId: string): AbortSignal {
    return this.activeAttempt === proposalId && this.activeAbort ? this.activeAbort.signal : AbortSignal.abort();
  }

  record(proposalId: string, result: UpdateResult, stage: "intent" | "outcome" = "outcome"): void {
    if (stage === "outcome" && this.activeAttempt === proposalId) {
      this.activeAttempt = undefined;
      this.activeAbort = undefined;
    }
    this.append(DESCRIPTION_RECORD, { event: stage, proposalId, result: structuredClone(result) });
  }
}
