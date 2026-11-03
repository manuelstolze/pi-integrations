import { spawn } from "node:child_process";
import { JiraToolError } from "../application/errors.js";
import type { JiraReadPort } from "../application/ports/jira-read-port.js";
import type { JiraDescriptionPort } from "../application/ports/jira-description-port.js";
import { equalJson, issueKey, type DescriptionProposal, type DescriptionSnapshot, type JiraTarget, type StoredDescription, type Submission } from "../domain/description-update.js";
import { DescriptionFiles } from "./description-files.js";
import { JiraNormalizationError } from "../domain/errors.js";
import {
  findJiraArray,
  findJiraNumber,
  normalizeComment,
  normalizeIssueDetails,
  normalizeIssueSummary,
} from "../domain/normalization.js";
import {
  DEFAULT_COMMENT_LIMIT,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_SEARCH_LIMIT,
  MAX_COMMENT_LIMIT,
  MAX_SEARCH_LIMIT,
  type JiraCommentsResult,
  type JiraIssueDetails,
  type JiraSearchResult,
} from "../domain/types.js";
import { requireLimit, requireText } from "../domain/validation.js";
import type { JiraClientOptions, JiraCommandOptions, JiraCommandResult, JiraLoginCredentials } from "./cli-types.js";

const SETUP_MESSAGE = [
  "Jira authentication is not configured.",
  "Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN, then authenticate with:",
  'echo "$JIRA_API_TOKEN" | acli jira auth login --site "$JIRA_URL" --email "$JIRA_EMAIL" --token',
  "Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens",
].join("\n");

const MAX_ERROR_EXCERPT_LENGTH = 500;

export class JiraCliAdapter implements JiraReadPort, JiraDescriptionPort {
  private readonly runCommand: JiraClientOptions["runCommand"];
  private readonly login: JiraClientOptions["login"];
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
        "jira", "workitem", "search", "--jql", query,
        "--fields", "key,issuetype,summary,status,assignee,priority",
        "--limit", String(boundedLimit), "--json",
      ],
      signal,
      "Jira issue search",
    );

    const root = asRecord(payload);
    const rawIssues = findJiraArray(payload, ["issues", "workItems", "results", "values"]);
    if (!rawIssues) {
      throw new JiraToolError("invalid-response", "Jira issue search returned no issue list.");
    }

    try {
      return {
        total: findJiraNumber(root, "total"),
        issues: rawIssues.map((issue) => normalizeIssueSummary(issue)),
      };
    } catch (error) {
      throw this.mapNormalizationError(error);
    }
  }

  async view(issueKey: string, signal?: AbortSignal): Promise<JiraIssueDetails> {
    const key = requireText(issueKey, "Issue key");
    await this.ensureAuthenticated(signal);
    const payload = await this.runJson(
      ["jira", "workitem", "view", key, "--json", "--fields", "*all"],
      signal,
      `Jira issue ${key}`,
    );
    try {
      return normalizeIssueDetails(payload);
    } catch (error) {
      throw this.mapNormalizationError(error);
    }
  }

  async readDescription(key: string, signal?: AbortSignal, allowLogin = false): Promise<DescriptionSnapshot> {
    issueKey(key);
    if (allowLogin) await this.ensureAuthenticated(signal);
    const target = await this.activeTarget(signal);
    const payload = await this.runJson(
      ["jira", "workitem", "view", key, "--json", "--fields", "*all"], signal, `Jira issue ${key}`,
    );
    const outer = asRecord(payload);
    const root = asRecord(outer?.issue) ?? asRecord(outer?.data) ?? outer;
    const fields = asRecord(root?.fields) ?? root;
    if (!fields || !Object.hasOwn(fields, "description")) throw new JiraToolError("invalid-response", "The complete description is missing; it is not known to be empty.");
    const raw = fields.description;
    if (raw !== null && typeof raw !== "string" && (!asRecord(raw) || asRecord(raw)?.type !== "doc" || asRecord(raw)?.version !== 1 || !Array.isArray(asRecord(raw)?.content))) {
      throw new JiraToolError("invalid-response", "Jira returned an unreadable description document.");
    }
    let issue;
    try { issue = normalizeIssueDetails(payload); }
    catch (error) { throw this.mapNormalizationError(error); }
    if (issue.key !== key) throw new JiraToolError("invalid-response", "Jira returned a different issue key.");
    return { target, issue, descriptionDocument: structuredClone(raw) as StoredDescription };
  }

  async replaceDescription(proposal: DescriptionProposal, signal?: AbortSignal): Promise<Submission> {
    const result: Submission = { writeAttempted: false };
    let file: Awaited<ReturnType<DescriptionFiles["create"]>> | undefined;
    try {
      issueKey(proposal.snapshot.issue.key);
      if (!equalJson(await this.activeTarget(signal), proposal.snapshot.target)) throw new JiraToolError("authentication-failed", "The active Jira account or site changed.");
      file = await new DescriptionFiles().create({ issues: [proposal.snapshot.issue.key], description: proposal.description });
      if (signal?.aborted) throw new Error("Update cancelled before command submission.");
      result.writeAttempted = true;
      const command = await this.runRaw(
        ["jira", "workitem", "edit", "--from-json", file.path, "--yes", "--json"], signal, "Jira description update",
      );
      if (command.killed) result.error = "Jira description update timed out or was cancelled; the saved result must be checked.";
      else if (command.code !== 0) result.error = `Jira description update failed: ${this.sanitize(command.stderr) || `exit code ${command.code}`}`;
    } catch (error) {
      result.error = this.sanitize(error instanceof Error ? error.message : "Jira description update failed.");
    } finally {
      if (file) {
        try { await file.remove(); }
        catch { result.cleanupError = "The private Jira payload file could not be removed."; }
      }
    }
    return result;
  }

  private async activeTarget(signal?: AbortSignal): Promise<JiraTarget> {
    const result = await this.runRaw(["jira", "auth", "status"], signal, "Jira account check");
    if (result.code !== 0 || result.killed) throw new JiraToolError("authentication-failed", "The active Jira account could not be established. Authenticate before preparing a new proposal.");
    const text = `${result.stdout}\n${result.stderr}`.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
    const sites = [...text.matchAll(/^\s*Site:\s*(\S+)\s*$/gm)];
    const accounts = [...text.matchAll(/^\s*Email:\s*(\S+)\s*$/gm)];
    if (sites.length !== 1 || accounts.length !== 1 || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(sites[0]![1]!)) {
      throw new JiraToolError("invalid-response", "ACLI did not identify one active Jira site and account.");
    }
    return { site: sites[0]![1]!.toLowerCase(), account: accounts[0]![1]! };
  }

  async comments(issueKey: string, limit = DEFAULT_COMMENT_LIMIT, signal?: AbortSignal): Promise<JiraCommentsResult> {
    const key = requireText(issueKey, "Issue key");
    const boundedLimit = requireLimit(limit, "comment", MAX_COMMENT_LIMIT);
    await this.ensureAuthenticated(signal);
    const payload = await this.runJson(
      ["jira", "workitem", "comment", "list", "--key", key, "--json", "--limit", String(boundedLimit)],
      signal,
      `Jira comments for ${key}`,
    );

    const rawComments = findJiraArray(payload, ["comments", "values", "results"]);
    if (!rawComments) {
      throw new JiraToolError("invalid-response", `Jira returned no comment list for ${key}.`);
    }
    try {
      return { issueKey: key, comments: rawComments.map(normalizeComment) };
    } catch (error) {
      throw this.mapNormalizationError(error);
    }
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
    if (signal?.aborted) throw new JiraToolError("timeout", "Jira operation cancelled before command execution.");
    try {
      return await this.runCommand(args, { signal, timeoutMs: this.timeoutMs });
    } catch (error) {
      if (isMissingCommandError(error)) {
        throw new JiraToolError("missing-cli", "The Atlassian CLI (acli) is not installed or is not available on PATH.");
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
        throw new JiraToolError("missing-cli", "The Atlassian CLI (acli) is not installed or is not available on PATH.");
      }
      const message = error instanceof Error ? error.message : "Unknown process error";
      throw new JiraToolError("authentication-failed", `Jira authentication could not run. Details: ${this.sanitize(message)}`);
    }
  }

  private mapNormalizationError(error: unknown): JiraToolError {
    if (error instanceof JiraNormalizationError) {
      return new JiraToolError("invalid-response", error.message);
    }
    return error instanceof JiraToolError ? error : new JiraToolError("invalid-response", "Jira returned an invalid response.");
  }

  private sanitize(value: string): string {
    const token = this.env.JIRA_API_TOKEN;
    let sanitized = token ? value.split(token).join("[redacted]") : value;
    sanitized = sanitized.replace(/\s+/g, " ").trim();
    return sanitized.slice(0, MAX_ERROR_EXCERPT_LENGTH);
  }
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

export async function runAcliLogin(
  credentials: JiraLoginCredentials,
  options: JiraCommandOptions,
): Promise<JiraCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnAcliLogin(credentials);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);
    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve({ stdout, stderr, code: code ?? 1, killed: timedOut || signal !== null || options.signal?.aborted === true });
    });
    child.stdin.end(`${credentials.token}\n`);
  });
}

function spawnAcliLogin(credentials: JiraLoginCredentials) {
  return spawn("acli", [
    "jira", "auth", "login", "--site", credentials.site,
    "--email", credentials.email, "--token",
  ], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isMissingCommandError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
