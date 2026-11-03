import type { AdfDocument, DescriptionProposal, DescriptionSnapshot, UpdateResult } from "../../domain/description-update.js";

export interface DescriptionProposalPort {
  create(snapshot: DescriptionSnapshot, description: AdfDocument): DescriptionProposal;
  find(proposalId: string): DescriptionProposal | undefined;
  consume(proposalId: string): DescriptionProposal | undefined;
  canSubmit(proposalId: string): boolean;
  submissionSignal(proposalId: string): AbortSignal;
  record(proposalId: string, result: UpdateResult, stage?: "intent" | "outcome"): void;
}
