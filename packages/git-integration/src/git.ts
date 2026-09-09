import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GitContext, RemoteInfo } from "./types.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
  killed?: boolean;
}

export async function runGit(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  timeout = 20_000,
): Promise<CommandResult> {
  try {
    const result = await pi.exec("git", ["-C", cwd, ...args], { timeout });
    return {
      // Preserve leading spaces. Git status and diff output use them as data.
      stdout: result.stdout.trimEnd(),
      stderr: result.stderr.trim(),
      code: result.code,
      killed: result.killed,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      code: -1,
    };
  }
}

export async function isGitRepo(pi: ExtensionAPI, cwd: string): Promise<boolean> {
  const result = await runGit(pi, cwd, ["rev-parse", "--git-dir"]);
  return result.code === 0;
}

export function parseStatusFiles(status: string): string[] {
  const files: string[] = [];
  for (const line of status.split("\n")) {
    if (!line.trim()) continue;
    const path = line.length > 3 ? line.slice(3).trim() : line.trim();
    if (!path) continue;
    const rename = path.split(" -> ");
    files.push(rename.at(-1) ?? path);
  }
  return [...new Set(files)];
}

export function makeSnapshot(status: string, stagedDiff: string, unstagedDiff: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ status, stagedDiff, unstagedDiff }))
    .digest("hex");
}

export async function collectGitContext(pi: ExtensionAPI, cwd: string): Promise<GitContext> {
  const [branch, status, stagedDiff, unstagedDiff, recentCommits] = await Promise.all([
    runGit(pi, cwd, ["branch", "--show-current"]),
    runGit(pi, cwd, ["status", "--short"]),
    runGit(pi, cwd, ["diff", "--cached"]),
    runGit(pi, cwd, ["diff"]),
    runGit(pi, cwd, ["log", "--oneline", "-15"]),
  ]);

  if (branch.code !== 0 || status.code !== 0 || stagedDiff.code !== 0 || unstagedDiff.code !== 0) {
    throw new Error(status.stderr || branch.stderr || "Could not read Git context");
  }

  return {
    branch: branch.stdout,
    status: status.stdout,
    changedFiles: parseStatusFiles(status.stdout),
    stagedDiff: stagedDiff.stdout,
    unstagedDiff: unstagedDiff.stdout,
    recentCommits: recentCommits.stdout,
    snapshot: makeSnapshot(status.stdout, stagedDiff.stdout, unstagedDiff.stdout),
  };
}

export async function readCurrentSnapshot(pi: ExtensionAPI, cwd: string): Promise<string> {
  const [status, stagedDiff, unstagedDiff] = await Promise.all([
    runGit(pi, cwd, ["status", "--short"]),
    runGit(pi, cwd, ["diff", "--cached"]),
    runGit(pi, cwd, ["diff"]),
  ]);
  if (status.code !== 0 || stagedDiff.code !== 0 || unstagedDiff.code !== 0) {
    throw new Error(status.stderr || "Could not read the current Git snapshot");
  }
  return makeSnapshot(status.stdout, stagedDiff.stdout, unstagedDiff.stdout);
}

export async function currentHead(pi: ExtensionAPI, cwd: string): Promise<string> {
  const result = await runGit(pi, cwd, ["rev-parse", "HEAD"]);
  if (result.code !== 0) throw new Error(result.stderr || "Could not read HEAD");
  return result.stdout;
}

export async function upstreamRemote(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
  const result = await runGit(pi, cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (result.code !== 0 || !result.stdout) return undefined;
  return result.stdout.split("/")[0];
}

export function parseRemoteUrl(url: string): { host: string; repository: string } {
  const trimmed = url.trim().replace(/\.git$/, "");
  if (trimmed.startsWith("ssh://")) {
    const parsed = new URL(trimmed);
    return { host: parsed.hostname.toLowerCase(), repository: parsed.pathname.replace(/^\//, "") };
  }
  if (trimmed.includes("://")) {
    const parsed = new URL(trimmed);
    return { host: parsed.hostname.toLowerCase(), repository: parsed.pathname.replace(/^\//, "") };
  }
  const match = trimmed.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (match) return { host: match[1].toLowerCase(), repository: match[2].replace(/^\//, "") };
  throw new Error(`Unsupported Git remote URL: ${url}`);
}

export async function listRemotes(pi: ExtensionAPI, cwd: string): Promise<RemoteInfo[]> {
  const result = await runGit(pi, cwd, ["remote", "-v"]);
  if (result.code !== 0) throw new Error(result.stderr || "Could not list Git remotes");

  const byName = new Map<string, { fetchUrl?: string; pushUrl?: string }>();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const entry = byName.get(match[1]) ?? {};
    if (match[3] === "fetch") entry.fetchUrl = match[2];
    else entry.pushUrl = match[2];
    byName.set(match[1], entry);
  }

  return [...byName.entries()].map(([name, value]) => {
    const fetchUrl = value.fetchUrl ?? value.pushUrl ?? "";
    const pushUrl = value.pushUrl ?? value.fetchUrl ?? "";
    const parsed = parseRemoteUrl(fetchUrl);
    return { name, fetchUrl, pushUrl, host: parsed.host, repository: parsed.repository };
  });
}

export function findRemote(remotes: RemoteInfo[], name: string | undefined): RemoteInfo | undefined {
  return name ? remotes.find((remote) => remote.name === name) : undefined;
}

export function isClean(status: string): boolean {
  return status.trim().length === 0;
}

export function isReadOnlyGitCommand(command: string): boolean {
  const normalized = command.trim();
  if (!/\bgit(?:\s|$)/.test(normalized)) return true;
  if (/[;&|`]|\$\(/.test(normalized)) return false;
  return /^(?:git(?:\s+-C\s+[^\s]+)?\s+)?(?:status|diff|log|show|branch\s+--show-current|branch\s+--list|remote\s+(?:-v|show)|rev-parse|ls-files|describe|tag\s+--list)(?:\s|$)/.test(normalized);
}
