import { describe, expect, it } from "vitest";
import { JiraInputError, JiraNormalizationError } from "../src/domain/errors.js";
import { normalizeComment, normalizeIssueDetails, normalizeIssueSummary, normalizeJiraText } from "../src/domain/normalization.js";
import { DEFAULT_COMMENT_LIMIT, DEFAULT_SEARCH_LIMIT, MAX_COMMENT_LIMIT, MAX_SEARCH_LIMIT } from "../src/domain/types.js";
import { requireLimit, requireText } from "../src/domain/validation.js";

describe("Jira domain rules", () => {
  it("defines the current default and maximum limits", () => {
    expect([DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, DEFAULT_COMMENT_LIMIT, MAX_COMMENT_LIMIT]).toEqual([10, 50, 5, 20]);
  });

  it("requires non-empty text and valid positive limits", () => {
    expect(requireText(" ODP-42 ", "Issue key")).toBe("ODP-42");
    expect(requireLimit(10, "search", MAX_SEARCH_LIMIT)).toBe(10);
    expect(() => requireText("  ", "JQL")).toThrow(JiraInputError);
    expect(() => requireLimit(0, "comment", MAX_COMMENT_LIMIT)).toThrow(JiraInputError);
    expect(() => requireLimit(51, "search", MAX_SEARCH_LIMIT)).toThrow(JiraInputError);
  });

  it("normalizes issue details and keeps missing values empty", () => {
    expect(normalizeIssueDetails({
      key: "ODP-42",
      fields: {
        summary: "Fix login",
        issuetype: { name: "Bug" },
        status: { name: "Open" },
        assignee: null,
        labels: null,
        description: null,
      },
    })).toEqual({
      key: "ODP-42",
      summary: "Fix login",
      type: "Bug",
      status: "Open",
      assignee: null,
      priority: null,
      reporter: null,
      labels: [],
      created: null,
      updated: null,
      description: null,
    });
  });

  it("normalizes nested Jira text and comments", () => {
    expect(normalizeJiraText({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "First line" }] }],
    })).toBe("First line");
    expect(normalizeComment({ body: "Review this", author: { displayName: "Ada" } })).toEqual({
      author: "Ada",
      date: null,
      body: "Review this",
    });
    expect(normalizeIssueSummary({ key: "ODP-42" }).summary).toBeNull();
  });

  it("reports invalid Jira issue data with a domain error", () => {
    expect(() => normalizeIssueSummary({ fields: {} })).toThrow(JiraNormalizationError);
    expect(() => normalizeIssueSummary(null)).toThrow(JiraNormalizationError);
  });
});
