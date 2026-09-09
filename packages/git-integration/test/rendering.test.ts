import { describe, expect, it } from "vitest";
import { renderGitIntegrationInstructions } from "../src/adapters/pi/render-instructions.js";
import { renderHeraldTask } from "../src/adapters/pi/render-task.js";
import type { PreparedHeraldRun } from "../src/application/use-cases/prepare-herald-run.js";

const snapshot = {
  branch: "feature/example",
  status: "",
  stagedDiff: "",
  unstagedDiff: "",
  recentCommits: "abc123 Commit",
};

describe("Pi renderers", () => {
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
