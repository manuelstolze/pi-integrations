import { describe, expect, it } from "vitest";
import { renderGitIntegrationInstructions } from "../src/interface/pi/render-instructions.js";
import { renderHeraldTask } from "../src/interface/pi/render-task.js";
import type { PreparedHeraldRun } from "../src/application/use-cases/prepare-herald-run.js";

const snapshot = {
  branch: "feature/example",
  status: "",
  stagedDiff: "",
  unstagedDiff: "",
  recentCommits: "abc123 Commit",
};

describe("Pi renderers", () => {
  it("keeps approval questions separate from workflow completion", () => {
    const text = renderGitIntegrationInstructions("github");
    expect(text).toContain("herald_finish");
    expect(text).toContain("Do not call it while waiting for approval or revisions");
    expect(text).toContain('status: "failed"');
    expect(text).toContain('status: "cancelled"');
    expect(text).toContain("Do not finish full mode between commits and the review request");
    expect(text).toContain("exact-command approval dialogs");
  });

  it.each(["commit", "request", "full"] as const)("defines when %s mode is complete", (mode) => {
    const run = { mode, provider: "github", snapshot, targetBranch: "main", diff: { kind: "available", baseRef: "origin/main", text: "diff" } } as PreparedHeraldRun;
    const text = renderHeraldTask(run);
    expect(text).toContain("herald_finish");
    expect(text).toContain('status: "completed"');
    expect(text).toContain(mode === "commit" ? "after the approved commits are verified" : "after the push and review request are verified");
  });

  it("renders a GitHub request with its provider instructions", () => {
    const run: PreparedHeraldRun = {
      mode: "request",
      provider: "github",
      snapshot,
      targetBranch: "main",
      diff: { kind: "available", baseRef: "origin/main", text: "diff --git" },
    };

    expect(renderHeraldTask(run)).toContain("## Diff vs `origin/main`");
    expect(renderGitIntegrationInstructions("github")).toContain("gh pr create");
    expect(renderGitIntegrationInstructions("github")).not.toContain("glab mr create");
  });

  it("keeps GitLab fallback order and repository policy instructions", () => {
    const text = renderGitIntegrationInstructions("gitlab");
    expect(text).toContain("- If CONTRIBUTING.md names a target branch, use it.\n- For GitLab, otherwise use `develop` when it exists, then `main`, then `master`.");
    expect(text).toContain("Use the fallback rules below only for topics that CONTRIBUTING.md does not address.");
    expect(text).toContain("The request diff in the task is preliminary when repository policy may select another target.\n  Verify the final target branch and inspect its diff before creating the merge request.");
  });

  it("renders an unresolved request target without inventing a branch", () => {
    const run: PreparedHeraldRun = {
      mode: "request",
      provider: "gitlab",
      snapshot,
      targetBranch: null,
      diff: { kind: "no-target" },
    };

    expect(renderHeraldTask(run)).toContain("no local target-branch ref found");
    expect(renderGitIntegrationInstructions("gitlab")).toContain("develop");
    expect(renderGitIntegrationInstructions("gitlab")).toContain("then `main`, then `master`");
  });
});
