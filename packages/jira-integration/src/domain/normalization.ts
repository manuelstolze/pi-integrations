import { JiraNormalizationError } from "./errors.js";
import type { JiraComment, JiraIssueDetails, JiraIssueSummary } from "./types.js";

const MAX_SUMMARY_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_COMMENT_BODY_LENGTH = 2_000;
const MAX_TEXT_LINES = 2_000;

export function normalizeJiraText(value: unknown): string | null {
  return truncateText(normalizeJiraTextValue(value), MAX_DESCRIPTION_LENGTH);
}

export function normalizeIssueSummary(value: unknown): JiraIssueSummary {
  const issue = unwrapIssue(value);
  const fields = getFields(issue);
  const key = readString(issue.key) ?? readString(fields.key);
  if (!key) {
    throw new JiraNormalizationError("Jira returned an issue without a key.");
  }

  return {
    key,
    summary: truncateText(readString(getValue(issue, fields, ["summary"])), MAX_SUMMARY_LENGTH),
    type: normalizeNamedValue(getValue(issue, fields, ["issuetype", "issueType", "type"])),
    status: normalizeNamedValue(getValue(issue, fields, ["status"])),
    assignee: normalizeUser(getValue(issue, fields, ["assignee"])),
    priority: normalizeNamedValue(getValue(issue, fields, ["priority"])),
  };
}

export function normalizeIssueDetails(value: unknown): JiraIssueDetails {
  const issue = unwrapIssue(value);
  const fields = getFields(issue);
  const summary = normalizeIssueSummary(issue);

  return {
    ...summary,
    reporter: normalizeUser(getValue(issue, fields, ["reporter"])),
    labels: normalizeLabels(getValue(issue, fields, ["labels"])),
    created: readString(getValue(issue, fields, ["created"])),
    updated: readString(getValue(issue, fields, ["updated"])),
    description: truncateText(normalizeJiraTextValue(getValue(issue, fields, ["description"])), MAX_DESCRIPTION_LENGTH),
  };
}

export function normalizeComment(value: unknown): JiraComment {
  const comment = asRecord(value) ?? {};
  return {
    author: normalizeUser(comment.author ?? comment.creator ?? comment.user),
    date: readString(comment.created) ?? readString(comment.updated) ?? readString(comment.date),
    body: truncateText(normalizeJiraTextValue(comment.body ?? comment.text ?? comment.content), MAX_COMMENT_BODY_LENGTH),
  };
}

function normalizeJiraTextValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeJiraTextValue(item))
      .filter((item): item is string => item !== null)
      .join("\n");
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  if (record.type === "hardBreak") {
    return "\n";
  }
  if (record.type === "mention") {
    const attrs = asRecord(record.attrs);
    return readString(attrs?.text) ?? readString(attrs?.displayName) ?? "@user";
  }
  if (record.type === "inlineCard") {
    const attrs = asRecord(record.attrs);
    return readString(attrs?.url) ?? "[link]";
  }
  if (Array.isArray(record.content)) {
    return (normalizeJiraTextValue(record.content) ?? "").trimEnd();
  }

  return `[Structured Jira text] ${JSON.stringify(record)}`;
}

function unwrapIssue(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    throw new JiraNormalizationError("Jira returned an invalid issue object.");
  }
  const nestedIssue = asRecord(record.issue);
  if (nestedIssue) {
    return nestedIssue;
  }
  const nestedData = asRecord(record.data);
  if (nestedData && (nestedData.key !== undefined || nestedData.fields !== undefined)) {
    return nestedData;
  }
  return record;
}

function getFields(issue: Record<string, unknown>): Record<string, unknown> {
  return asRecord(issue.fields) ?? issue;
}

function getValue(issue: Record<string, unknown>, fields: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (issue[name] !== undefined) {
      return issue[name];
    }
    if (fields[name] !== undefined) {
      return fields[name];
    }
  }
  return undefined;
}

function findArray(value: unknown, names: string[]): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  for (const name of names) {
    if (Array.isArray(record[name])) {
      return record[name];
    }
  }
  const data = asRecord(record.data);
  if (data) {
    for (const name of names) {
      if (Array.isArray(data[name])) {
        return data[name];
      }
    }
  }
  return undefined;
}

export function findJiraArray(value: unknown, names: string[]): unknown[] | undefined {
  return findArray(value, names);
}

export function findJiraNumber(value: unknown, key: string): number | null {
  const record = asRecord(value);
  const direct = readNumber(record?.[key]);
  if (direct !== null) {
    return direct;
  }
  return readNumber(asRecord(record?.data)?.[key]);
}

function normalizeNamedValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return readString(record.name) ?? readString(record.value) ?? readString(record.id);
}

function normalizeUser(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return (
    readString(record.displayName) ??
    readString(record.name) ??
    readString(record.accountId) ??
    readString(record.key)
  );
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === "string" && value ? [value] : [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return item ? [item] : [];
    }
    const label = normalizeNamedValue(item);
    return label ? [label] : [];
  });
}

function truncateText(value: string | null, maximumCharacters: number): string | null {
  if (value === null) {
    return null;
  }

  const lines = value.split("\n");
  const lineLimited = lines.length > MAX_TEXT_LINES;
  const byLines = lines.slice(0, MAX_TEXT_LINES).join("\n");
  if (!lineLimited && byLines.length <= maximumCharacters) {
    return byLines;
  }

  const shortened = byLines.slice(0, maximumCharacters);
  return `${shortened}\n[Text truncated]`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
