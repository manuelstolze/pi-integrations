import { createJiraUseCases } from "../application/use-cases/jira-tools.js";
import { JiraCliAdapter } from "./jira-cli-adapter.js";
import type { JiraClientOptions } from "./cli-types.js";
import type { JiraCommentsResult, JiraIssueDetails, JiraSearchResult } from "../domain/types.js";

export class JiraClient {
  private readonly useCases: ReturnType<typeof createJiraUseCases>;

  constructor(options: JiraClientOptions) {
    this.useCases = createJiraUseCases(new JiraCliAdapter(options));
  }

  search(jql: string, limit?: number, signal?: AbortSignal): Promise<JiraSearchResult> {
    return this.useCases.search(jql, limit, signal);
  }

  view(issueKey: string, signal?: AbortSignal): Promise<JiraIssueDetails> {
    return this.useCases.view(issueKey, signal);
  }

  comments(issueKey: string, limit?: number, signal?: AbortSignal): Promise<JiraCommentsResult> {
    return this.useCases.comments(issueKey, limit, signal);
  }
}

export type {
  JiraClientOptions,
  JiraCommandOptions,
  JiraCommandResult,
  JiraCommandRunner,
  JiraLoginCredentials,
  JiraLoginRunner,
} from "./cli-types.js";
