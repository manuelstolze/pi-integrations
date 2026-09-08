export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_COMMENT_LIMIT = 5;
export const MAX_COMMENT_LIMIT = 20;

export interface JiraCommandResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

export interface JiraCommandOptions {
  signal?: AbortSignal;
  timeoutMs: number;
}

export type JiraCommandRunner = (
  args: string[],
  options: JiraCommandOptions,
) => Promise<JiraCommandResult>;

export interface JiraLoginCredentials {
  site: string;
  email: string;
  token: string;
}

export type JiraLoginRunner = (
  credentials: JiraLoginCredentials,
  options: JiraCommandOptions,
) => Promise<JiraCommandResult>;

export interface JiraClientOptions {
  runCommand: JiraCommandRunner;
  login: JiraLoginRunner;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export type JiraErrorCode =
  | "invalid-input"
  | "missing-cli"
  | "authentication-required"
  | "authentication-failed"
  | "command-failed"
  | "timeout"
  | "invalid-json"
  | "invalid-response";

export class JiraToolError extends Error {
  readonly code: JiraErrorCode;

  constructor(code: JiraErrorCode, message: string) {
    super(message);
    this.name = "JiraToolError";
    this.code = code;
  }
}

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

const SETUP_MESSAGE = [
  "Jira authentication is not configured.",
  "Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN, then authenticate with:",
  "echo \"$JIRA_API_TOKEN\" | acli jira auth login --site \"$JIRA_URL\" --email \"$JIRA_EMAIL\" --token",
  "Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens",
].join("\n");

const MAX_ERROR_EXCERPT_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_COMMENT_BODY_LENGTH = 2_000;
const MAX_TEXT_LINES = 2_000;

export class JiraClient {
  private readonly runCommand: JiraCommandRunner;
  private readonly login: JiraLoginRunner;
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private authenticationPromise: Promise<void> | undefined;

  constructor(options: JiraClientOptions) {
    this.runCommand = options.runCommand;
    this.login = options.login;
    this.env = options.env ?? process.env;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  async search(jql: string, limit = DEFAULT_SEARCH_LIMIT, signal?: AbortSignal): Promise<JiraSearchResult> {
    const query = requireText(jql, "JQL");
    const boundedLimit = requireLimit(limit, "search", MAX_SEARCH_LIMIT);
    await this.ensureAuthenticated(signal);

    const payload = await this.runJson(
      [
        "jira",
        "workitem",
        "search",
        "--jql",
        query,
        "--fields",
        "key,issuetype,summary,status,assignee,priority",
        "--limit",
        String(boundedLimit),
        "--json",
      ],
      signal,
      "Jira issue search",
    );

    const root = asRecord(payload);
    const rawIssues = findArray(payload, ["issues", "workItems", "results", "values"]);
    if (!rawIssues) {
      throw new JiraToolError("invalid-response", "Jira issue search returned no issue list.");
    }

    const issues = rawIssues.map((issue) => normalizeIssueSummary(issue));
    const total = readNumber(root?.total) ?? readNumber(asRecord(root?.data)?.total);

    return { total, issues };
  }

  async view(issueKey: string, signal?: AbortSignal): Promise<JiraIssueDetails> {
    const key = requireText(issueKey, "Issue key");
    await this.ensureAuthenticated(signal);

    const payload = await this.runJson(
      ["jira", "workitem", "view", key, "--json", "--fields", "*all"],
      signal,
      `Jira issue ${key}`,
    );

    return normalizeIssueDetails(payload);
  }

  async comments(issueKey: string, limit = DEFAULT_COMMENT_LIMIT, signal?: AbortSignal): Promise<JiraCommentsResult> {
    const key = requireText(issueKey, "Issue key");
    const boundedLimit = requireLimit(limit, "comment", MAX_COMMENT_LIMIT);
    await this.ensureAuthenticated(signal);

    const payload = await this.runJson(
      [
        "jira",
        "workitem",
        "comment",
        "list",
        "--key",
        key,
        "--json",
        "--limit",
        String(boundedLimit),
      ],
      signal,
      `Jira comments for ${key}`,
    );

    const rawComments = findArray(payload, ["comments", "values", "results"]);
    if (!rawComments) {
      throw new JiraToolError("invalid-response", `Jira returned no comment list for ${key}.`);
    }

    return {
      issueKey: key,
      comments: rawComments.map(normalizeComment),
    };
  }

  private async ensureAuthenticated(signal?: AbortSignal): Promise<void> {
    const existing = this.authenticationPromise;
    if (existing) {
      await existing;
      return;
    }

    const authentication = this.authenticate(signal);
    this.authenticationPromise = authentication;

    try {
      await authentication;
    } finally {
      if (this.authenticationPromise === authentication) {
        this.authenticationPromise = undefined;
      }
    }
  }

  private async authenticate(signal?: AbortSignal): Promise<void> {
    const status = await this.runRaw(["jira", "auth", "status"], signal, "Jira authentication check");
    if (status.killed) {
      throw new JiraToolError("timeout", `Jira authentication check timed out after ${this.timeoutMs / 1000} seconds.`);
    }
    if (status.code === 0) {
      return;
    }

    const credentials = getCredentials(this.env);
    if (!credentials) {
      throw new JiraToolError("authentication-required", SETUP_MESSAGE);
    }

    const login = await this.runLogin(credentials, signal);
    if (login.killed) {
      throw new JiraToolError("timeout", `Jira authentication timed out after ${this.timeoutMs / 1000} seconds.`);
    }
    if (login.code !== 0) {
      const detail = this.sanitize(login.stderr);
      throw new JiraToolError(
        "authentication-failed",
        detail ? `Jira authentication failed. Details: ${detail}` : "Jira authentication failed.",
      );
    }
  }

  private async runJson(args: string[], signal: AbortSignal | undefined, operation: string): Promise<unknown> {
    const result = await this.runRaw(args, signal, operation);
    if (result.killed) {
      throw new JiraToolError("timeout", `${operation} timed out after ${this.timeoutMs / 1000} seconds.`);
    }
    if (result.code !== 0) {
      const detail = this.sanitize(result.stderr);
      throw new JiraToolError(
        "command-failed",
        detail ? `${operation} failed. Details: ${detail}` : `${operation} failed with exit code ${result.code}.`,
      );
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new JiraToolError("invalid-json", `${operation} returned invalid JSON.`);
    }
  }

  private async runRaw(args: string[], signal: AbortSignal | undefined, operation: string): Promise<JiraCommandResult> {
    try {
      return await this.runCommand(args, { signal, timeoutMs: this.timeoutMs });
    } catch (error) {
      if (isMissingCommandError(error)) {
        throw new JiraToolError(
          "missing-cli",
          "The Atlassian CLI (acli) is not installed or is not available on PATH.",
        );
      }

      const message = error instanceof Error ? error.message : "Unknown process error";
      throw new JiraToolError("command-failed", `${operation} could not run. Details: ${this.sanitize(message)}`);
    }
  }

  private async runLogin(credentials: JiraLoginCredentials, signal: AbortSignal | undefined): Promise<JiraCommandResult> {
    try {
      return await this.login(credentials, { signal, timeoutMs: this.timeoutMs });
    } catch (error) {
      if (isMissingCommandError(error)) {
        throw new JiraToolError(
          "missing-cli",
          "The Atlassian CLI (acli) is not installed or is not available on PATH.",
        );
      }

      const message = error instanceof Error ? error.message : "Unknown process error";
      throw new JiraToolError("authentication-failed", "Jira authentication could not run. Details: " + this.sanitize(message));
    }
  }

  private sanitize(value: string): string {
    const token = this.env.JIRA_API_TOKEN;
    let sanitized = token ? value.split(token).join("[redacted]") : value;
    sanitized = sanitized.replace(/\s+/g, " ").trim();
    return sanitized.slice(0, MAX_ERROR_EXCERPT_LENGTH);
  }
}

export function normalizeJiraText(value: unknown): string | null {
  return truncateText(normalizeJiraTextValue(value), MAX_DESCRIPTION_LENGTH);
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
  if (typeof record.type === "string" && record.type === "mention") {
    const attrs = asRecord(record.attrs);
    return readString(attrs?.text) ?? readString(attrs?.displayName) ?? "@user";
  }
  if (typeof record.type === "string" && record.type === "inlineCard") {
    const attrs = asRecord(record.attrs);
    return readString(attrs?.url) ?? "[link]";
  }
  if (Array.isArray(record.content)) {
    return (normalizeJiraTextValue(record.content) ?? "").trimEnd();
  }

  return `[Structured Jira text] ${JSON.stringify(record)}`;
}

export function normalizeIssueSummary(value: unknown): JiraIssueSummary {
  const issue = unwrapIssue(value);
  const fields = getFields(issue);
  const key = readString(issue.key) ?? readString(fields.key);
  if (!key) {
    throw new JiraToolError("invalid-response", "Jira returned an issue without a key.");
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

function getCredentials(env: NodeJS.ProcessEnv): JiraLoginCredentials | undefined {
  const site = env.JIRA_URL?.trim();
  const email = env.JIRA_EMAIL?.trim();
  const token = env.JIRA_API_TOKEN;
  if (!site || !email || !token) {
    return undefined;
  }
  return { site, email, token };
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new JiraToolError("invalid-input", `${label} must not be empty.`);
  }
  return trimmed;
}

function requireLimit(value: number, label: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new JiraToolError("invalid-input", `${label} limit must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function unwrapIssue(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    throw new JiraToolError("invalid-response", "Jira returned an invalid issue object.");
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

function getValue(
  issue: Record<string, unknown>,
  fields: Record<string, unknown>,
  names: string[],
): unknown {
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

function isMissingCommandError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
