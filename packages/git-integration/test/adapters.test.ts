import { describe, expect, it, vi } from "vitest";
import type { ProcessResult, ProcessRunner } from "../src/adapters/process/process-runner.js";
import { GitCliAdapter } from "../src/adapters/git/git-cli-adapter.js";
import { GitHubHostingAdapter } from "../src/adapters/hosting/github-adapter.js";
import { GitLabHostingAdapter } from "../src/adapters/hosting/gitlab-adapter.js";
import { HostingProviderRegistry } from "../src/adapters/hosting/provider-registry.js";

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

  it("treats a new repository log as empty", async () => {
    const process = runner([
      result("", 0),
      result("", 0),
      result("", 0),
      result("", 128, "fatal: your current branch does not have any commits yet"),
      result("main"),
    ]);

    await expect(new GitCliAdapter(process).snapshot()).resolves.toMatchObject({ recentCommits: "" });
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
