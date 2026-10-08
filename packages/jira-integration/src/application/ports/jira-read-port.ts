import type { JiraCommentsResult, JiraIssueDetails, JiraSearchResult } from "../../domain/types.js";

export interface JiraReadPort {
  search(jql: string, limit: number, signal?: AbortSignal): Promise<JiraSearchResult>;
  view(issueKey: string, signal?: AbortSignal): Promise<JiraIssueDetails>;
  comments(issueKey: string, limit: number, signal?: AbortSignal): Promise<JiraCommentsResult>;
}
