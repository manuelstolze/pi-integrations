import { JiraInputError, JiraNormalizationError } from "../../domain/errors.js";
import { DEFAULT_COMMENT_LIMIT, DEFAULT_SEARCH_LIMIT, MAX_COMMENT_LIMIT, MAX_SEARCH_LIMIT } from "../../domain/types.js";
import { requireLimit, requireText } from "../../domain/validation.js";
import { JiraToolError } from "../errors.js";
import type { JiraReadPort } from "../ports/jira-read-port.js";
import type { JiraDescriptionPort } from "../ports/jira-description-port.js";
import type { StoredDescription } from "../../domain/description-update.js";
import type { JiraIssueDetails } from "../../domain/types.js";

export interface JiraUseCases {
  search(jql: string, limit?: number, signal?: AbortSignal): ReturnType<JiraReadPort["search"]>;
  view(issueKey: string, signal?: AbortSignal): ReturnType<JiraReadPort["view"]>;
  comments(issueKey: string, limit?: number, signal?: AbortSignal): ReturnType<JiraReadPort["comments"]>;
  viewDocument?(issueKey: string, signal?: AbortSignal): Promise<JiraIssueDetails & { descriptionDocument: StoredDescription }>;
}

export function createJiraUseCases(port: JiraReadPort, descriptions?: JiraDescriptionPort): JiraUseCases {
  return {
    async viewDocument(key, signal) {
      if (!descriptions) throw new JiraToolError("command-failed", "Complete description access is unavailable.");
      const snapshot = await descriptions.readDescription(requireText(key, "Issue key"), signal, true);
      return { ...snapshot.issue, descriptionDocument: snapshot.descriptionDocument };
    },
    async search(jql, limit = DEFAULT_SEARCH_LIMIT, signal) {
      try {
        return await port.search(
          requireText(jql, "JQL"),
          requireLimit(limit, "search", MAX_SEARCH_LIMIT),
          signal,
        );
      } catch (error) {
        throw mapJiraError(error);
      }
    },
    async view(issueKey, signal) {
      try {
        return await port.view(requireText(issueKey, "Issue key"), signal);
      } catch (error) {
        throw mapJiraError(error);
      }
    },
    async comments(issueKey, limit = DEFAULT_COMMENT_LIMIT, signal) {
      try {
        return await port.comments(
          requireText(issueKey, "Issue key"),
          requireLimit(limit, "comment", MAX_COMMENT_LIMIT),
          signal,
        );
      } catch (error) {
        throw mapJiraError(error);
      }
    },
  };
}

export function mapJiraError(error: unknown): Error {
  if (error instanceof JiraToolError) {
    return error;
  }
  if (error instanceof JiraInputError) {
    return new JiraToolError("invalid-input", error.message);
  }
  if (error instanceof JiraNormalizationError) {
    return new JiraToolError("invalid-response", error.message);
  }
  if (error instanceof Error) {
    return error;
  }
  return new JiraToolError("command-failed", "Unknown Jira error.");
}
