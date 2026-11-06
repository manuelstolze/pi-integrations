import { describe, expect, it } from "vitest";
import { renderGitIntegrationInstructions } from "../src/interface/pi/render-instructions.js";
import { renderHeraldTask } from "../src/interface/pi/render-task.js";
import { renderStageProposal } from "../src/interface/pi/render-stage-proposal.js";
import type { PreparedHeraldRun } from "../src/application/use-cases/prepare-herald-run.js";

const snapshot = {
  branch: "feature/example",
  status: "",
  stagedDiff: "",
  unstagedDiff: "",
  recentCommits: "abc123 Commit",
};

describe("Pi renderers", () => {
  it("describes proposal tools, later reply checks, and workflow completion", () => {
    const text = renderGitIntegrationInstructions("github");
    expect(text).toContain("herald_finish");
    expect(text).toContain("Do not call `herald_finish` while\nwaiting.");
    expect(text).toContain('Call `herald_propose_commits`');
    expect(text).toContain('Call `herald_propose_request`');
    expect(text).toContain('`herald_report_reply` with the proposal ID');
    expect(text).toContain("Do not treat input queued before the proposal appears");
    expect(text).toContain("This does not independently prove that your interpretation is");
    expect(text).toContain("For a terminal failure, use `failed`");
    expect(text).toContain("If the user cancels,")
    expect(text).toContain("A command attempt is");
    expect(text).not.toContain("exact-command approval dialogs");
    expect(text).not.toContain("$TARGET_BRANCH");
    expect(text).not.toContain("$(cat");
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
    expect(text).toContain("Otherwise, GitLab uses\n`develop`, then `main`, then `master`; GitHub uses its default branch.");
    expect(text).toContain("Use the fallback rules below only for topics that the repository rules do not cover.");
    expect(text).toContain("`glab mr create`");
    expect(text).toContain("`--description-file`");
  });

  it("renders every commit input, message, and exact command without truncation", () => {
    const message = `Subject line
Complete body text with inline code.`;
    const command = "git add -- ':(literal)src/example.ts' && git commit -m 'Subject line'";
    const rendered = renderStageProposal("proposal-1", {
      stage: "commit",
      commits: [{ message, files: ["src/example.ts", "src/another.ts"], command, inputSnapshot: "snapshot" }],
    });
    expect(rendered).toContain("proposal-1");
    expect(rendered).toContain("src/example.ts");
    expect(rendered).toContain("src/another.ts");
    expect(rendered).toContain(message);
    expect(rendered).toContain(command);
  });

  it("renders the complete review request and both exact commands", () => {
    const description = `## Summary

Complete review description.`;
    const push = "git push origin 'feature/example:feature/example'";
    const create = "gh pr create --base 'main' --head 'feature/example' --title 'Add example' --body-file 'request.md'";
    const rendered = renderStageProposal("proposal-2", {
      stage: "request", provider: "github", sourceBranch: "feature/example", targetBranch: "main",
      title: "Add example", description, descriptionInput: { kind: "file", path: "request.md", contentBase64: "ZGVzY3JpcHRpb24=" },
      commands: [
        { action: "push", command: push, inputSnapshot: "push-snapshot" },
        { action: "create", command: create, inputSnapshot: "request-snapshot" },
      ],
    });
    expect(rendered).toContain("proposal-2");
    expect(rendered).toContain("Add example");
    expect(rendered).toContain(description);
    expect(rendered).toContain("request.md");
    expect(rendered).toContain(push);
    expect(rendered).toContain(create);
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
