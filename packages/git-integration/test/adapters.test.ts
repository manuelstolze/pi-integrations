import { describe, expect, it, vi } from "vitest";
import type { ProcessResult, ProcessRunner } from "../src/infrastructure/process/process-runner.js";
import { GitCliAdapter } from "../src/infrastructure/git/git-cli-adapter.js";
import { GitHubHostingAdapter } from "../src/infrastructure/hosting/github-adapter.js";
import { GitLabHostingAdapter } from "../src/infrastructure/hosting/gitlab-adapter.js";
import { HostingProviderRegistry } from "../src/infrastructure/hosting/provider-registry.js";

function result(stdout = "", code = 0, stderr = ""): ProcessResult {
  return { stdout, stderr, code };
}

function runner(results: ProcessResult[]): ProcessRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run: vi.fn(async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      const next = results.shift();
      if (!next) throw new Error("No fake process result available");
      return next;
    }),
  };
}

describe("GitCliAdapter", () => {
  it("maps Git command output to a repository snapshot", async () => {
    const process = runner([
      result(" M file.ts"),
      result("staged diff"),
      result("unstaged diff"),
      result("abc123 Recent commit"),
      result("feature/example"),
    ]);
    const git = new GitCliAdapter(process);

    await expect(git.snapshot()).resolves.toEqual({
      status: " M file.ts",
      stagedDiff: "staged diff",
      unstagedDiff: "unstaged diff",
      recentCommits: "abc123 Recent commit",
      branch: "feature/example",
    });
    expect(process.calls).toEqual([
      ["git", "status", "--short"],
      ["git", "diff", "--cached"],
      ["git", "diff"],
      ["git", "log", "--oneline", "-15"],
      ["git", "branch", "--show-current"],
    ]);
  });

  it.each([
    "Schwerwiegend: Ihr aktueller Branch 'master' hat noch keine Commits.",
    "fatal: your current branch does not have any commits yet",
    "history is unavailable",
  ])("treats a missing branch reference as empty history: %s", async (message) => {
    const process = runner([
      result("AM file.ts"),
      result("staged diff"),
      result("unstaged diff"),
      result("", 128, message),
      result("master"),
      result("refs/heads/master"),
      result("", 1),
    ]);

    await expect(new GitCliAdapter(process).snapshot()).resolves.toEqual({
      status: "AM file.ts",
      stagedDiff: "staged diff",
      unstagedDiff: "unstaged diff",
      recentCommits: "",
      branch: "master",
    });
    expect(process.calls.slice(5)).toEqual([
      ["git", "symbolic-ref", "--quiet", "HEAD"],
      ["git", "show-ref", "--verify", "--quiet", "refs/heads/master"],
    ]);
  });

  it.each([
    { name: "an existing branch", symbolic: result("refs/heads/main"), reference: result() },
    { name: "a failed branch lookup", symbolic: result("", 128, "lookup failed"), reference: null },
    { name: "a detached HEAD", symbolic: result("", 1), reference: null },
    { name: "an empty branch name", symbolic: result(), reference: null },
    { name: "an incomplete branch reference", symbolic: result("refs/heads/"), reference: null },
    { name: "a non-branch reference", symbolic: result("refs/tags/example"), reference: null },
    { name: "a failed reference lookup", symbolic: result("refs/heads/main"), reference: result("", 128) },
    { name: "a reference process failure", symbolic: result("refs/heads/main"), reference: result("", -1) },
  ])("preserves the history error for $name", async ({ symbolic, reference }) => {
    const message = "fatal: your current branch does not have any commits yet";
    const process = runner([
      result(), result(), result(), result("", 128, message), result("main"),
      symbolic, ...(reference ? [reference] : []),
    ]);

    await expect(new GitCliAdapter(process).snapshot()).rejects.toThrow(
      `git log --oneline -15 failed: ${message}`,
    );
    expect(process.calls).toHaveLength(reference ? 7 : 6);
  });

  it("does not treat a history process failure as empty history", async () => {
    const process = runner([
      result(), result(), result(), result("", -1, "spawn failed"), result("main"),
      result("refs/heads/main"), result("", 1),
    ]);

    await expect(new GitCliAdapter(process).snapshot()).rejects.toThrow(
      "git log --oneline -15 failed: spawn failed",
    );
    expect(process.calls).toHaveLength(5);
  });

  it.each([
    { index: 0, command: "status --short" },
    { index: 1, command: "diff --cached" },
    { index: 2, command: "diff" },
    { index: 4, command: "branch --show-current" },
  ])("preserves a required $command failure without history", async ({ index, command }) => {
    const results = [
      result(), result(), result(), result("", 128, "no commits"), result("main"),
      result("refs/heads/main"), result("", 1),
    ];
    results[index] = result("", 128, "read failed");

    await expect(new GitCliAdapter(runner(results)).snapshot()).rejects.toThrow(
      `git ${command} failed: read failed`,
    );
  });
});

describe("hosting adapters", () => {
  it("validates GitHub and reuses its default branch result", async () => {
    const process = runner([result("main")]);
    const github = new GitHubHostingAdapter(process);

    await github.validateAccess();
    await expect(github.defaultBranch()).resolves.toBe("main");
    expect(process.calls).toHaveLength(1);
  });

  it("validates GitLab through glab", async () => {
    const process = runner([result("{}")]);
    const gitlab = new GitLabHostingAdapter(process);

    await expect(gitlab.validateAccess()).resolves.toBeUndefined();
    expect(process.calls).toEqual([["glab", "repo", "view", "--output", "json"]]);
  });

  it("selects a provider adapter from the provider hint", async () => {
    const githubProcess = runner([result("main")]);
    const gitlabProcess = runner([result("{}")]);
    const registry = new HostingProviderRegistry([
      new GitHubHostingAdapter(githubProcess),
      new GitLabHostingAdapter(gitlabProcess),
    ]);

    await expect(registry.resolve("https://github.com/owner/repo.git", "github")).resolves.toBe("github");
    await expect(registry.resolve("git@gitlab.example.com:group/repo.git", null)).resolves.toBe("gitlab");
    expect(githubProcess.calls[0][0]).toBe("gh");
    expect(gitlabProcess.calls[0][0]).toBe("glab");
  });
});
