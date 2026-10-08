import { mapJiraError } from "../application/use-cases/jira-tools.js";
import {
  normalizeComment as normalizeCommentValue,
  normalizeIssueDetails as normalizeIssueDetailsValue,
  normalizeIssueSummary as normalizeIssueSummaryValue,
  normalizeJiraText as normalizeJiraTextValue,
} from "../domain/normalization.js";

export function normalizeJiraText(value: unknown): string | null {
  try {
    return normalizeJiraTextValue(value);
  } catch (error) {
    throw mapJiraError(error);
  }
}

export function normalizeIssueSummary(value: unknown) {
  try {
    return normalizeIssueSummaryValue(value);
  } catch (error) {
    throw mapJiraError(error);
  }
}

export function normalizeIssueDetails(value: unknown) {
  try {
    return normalizeIssueDetailsValue(value);
  } catch (error) {
    throw mapJiraError(error);
  }
}

export function normalizeComment(value: unknown) {
  try {
    return normalizeCommentValue(value);
  } catch (error) {
    throw mapJiraError(error);
  }
}
