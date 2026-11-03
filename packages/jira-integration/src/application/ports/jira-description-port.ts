import type { DescriptionProposal, DescriptionSnapshot, Submission } from "../../domain/description-update.js";

export interface JiraDescriptionPort {
  readDescription(issueKey: string, signal?: AbortSignal, allowLogin?: boolean): Promise<DescriptionSnapshot>;
  replaceDescription(proposal: DescriptionProposal, signal?: AbortSignal): Promise<Submission>;
}
