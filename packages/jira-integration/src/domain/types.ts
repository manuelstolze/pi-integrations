export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_COMMENT_LIMIT = 5;
export const MAX_COMMENT_LIMIT = 20;

export interface JiraIssueSummary {
  key: string;
  summary: string | null;
  type: string | null;
  status: string | null;
  assignee: string | null;
  priority: string | null;
}

export interface JiraIssueDetails extends JiraIssueSummary {
  reporter: string | null;
  labels: string[];
  created: string | null;
  updated: string | null;
  description: string | null;
}

export interface JiraComment {
  author: string | null;
  date: string | null;
  body: string | null;
}

export interface JiraSearchResult {
  total: number | null;
  issues: JiraIssueSummary[];
}

export interface JiraCommentsResult {
  issueKey: string;
  comments: JiraComment[];
}
