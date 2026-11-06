import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunner } from "../src/infrastructure/process/process-runner.js";
import { ReviewRequestInputChecker } from "../src/infrastructure/hosting/request-input-checker.js";
import type { RequestStageDraft } from "../src/application/ports/stage-input-check-ports.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function fakeGit(state: { branch: string; origin: string }): ProcessRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(command, args): Promise<ProcessResult> {
      calls.push([command, ...args]);
      if (command !== "git") return { stdout: "", stderr: "unexpected command", code: 127 };
      if (args[0] === "check-ref-format") return { stdout: "", stderr: "", code: 0 };
      if (args[0] === "branch" && args[1] === "--show-current") {
        return { stdout: state.branch, stderr: "", code: 0 };
      }
      if (args[0] === "remote" && args[1] === "get-url") {
        return { stdout: state.origin, stderr: "", code: 0 };
      }
      return { stdout: "", stderr: `unexpected git command: ${args.join(" ")}`, code: 2 };
    },
  };
}

const inlineRequest = (provider: "github" | "gitlab" = "github"): RequestStageDraft => ({
  stage: "request",
  provider,
  sourceBranch: "feature/example",
  targetBranch: "main",
  title: "Add example",
  description: "Review the example change.",
  descriptionInput: { kind: "inline" },
});

describe("ReviewRequestInputChecker", () => {
  it("generates explicit GitHub push and request commands and checks branch inputs", async () => {
    const state = { branch: "feature/example", origin: "https://github.com/owner/repo.git" };
    const runner = fakeGit(state);
    const checker = new ReviewRequestInputChecker(runner, "/repo", "github");
    const prepared = await checker.prepare(inlineRequest());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.proposal.commands).toEqual([
      expect.objectContaining({ action: "push", command: "git push origin 'feature/example:feature/example'" }),
      expect.objectContaining({
        action: "create",
        command: "gh pr create --base 'main' --head 'feature/example' --title 'Add example' --body 'Review the example change.'",
      }),
    ]);
    await expect(checker.verify(prepared.proposal, "push")).resolves.toEqual({ ok: true });
    await expect(checker.verify(prepared.proposal, "create")).resolves.toEqual({ ok: true });

    state.branch = "other-branch";
    await expect(checker.verify(prepared.proposal, "push")).resolves.toMatchObject({ ok: false });
    expect(runner.calls.every(([command]) => command === "git")).toBe(true);
  });

  it("checks explicit GitLab branches and the exact bytes at a description-file path", async () => {
    const root = await mkdtemp(join(tmpdir(), "request-input-check-"));
    directories.push(root);
    const description = "## Summary\n\nReview the approved change.\n";
    const path = "request description.md";
    await writeFile(join(root, path), description);
    const runner = fakeGit({ branch: "feature/example", origin: "https://gitlab.example/group/repo.git" });
    const checker = new ReviewRequestInputChecker(runner, root, "gitlab");
    const draft: RequestStageDraft = {
      ...inlineRequest("gitlab"),
      description,
      descriptionInput: { kind: "file", path, contentBase64: Buffer.from(description).toString("base64") },
    };
    const prepared = await checker.prepare(draft);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.proposal.commands[1].command).toBe(
      "glab mr create --source-branch 'feature/example' --target-branch 'main' --title 'Add example' "
      + "--description-file 'request description.md' --remove-source-branch --yes",
    );
    await expect(checker.verify(prepared.proposal, "create")).resolves.toEqual({ ok: true });
    await writeFile(join(root, path), "changed description\n");
    await expect(checker.verify(prepared.proposal, "push")).resolves.toEqual({ ok: true });
    await expect(checker.verify(prepared.proposal, "create")).resolves.toMatchObject({ ok: false });
  });

  it("keeps an earlier successful push and prepares only the remaining request command", async () => {
    const state = { branch: "feature/example", origin: "https://github.com/owner/repo.git" };
    const checker = new ReviewRequestInputChecker(fakeGit(state), "/repo", "github");
    const prepared = await checker.prepare({ ...inlineRequest(), pushAlreadyCompleted: true });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.proposal.pushAlreadyCompleted).toBe(true);
    expect(prepared.proposal.commands).toHaveLength(1);
    expect(prepared.proposal.commands[0].action).toBe("create");
    await expect(checker.verify(prepared.proposal, "push")).resolves.toMatchObject({ ok: false });
    await expect(checker.verify(prepared.proposal, "create")).resolves.toEqual({ ok: true });
  });

  it("rejects missing branches, mismatched providers, and unsupported multiline inline text", async () => {
    const state = { branch: "feature/example", origin: "https://github.com/owner/repo.git" };
    const checker = new ReviewRequestInputChecker(fakeGit(state), "/repo", "github");
    await expect(checker.prepare({ ...inlineRequest(), sourceBranch: " " })).resolves.toMatchObject({ ok: false });
    await expect(checker.prepare(inlineRequest("gitlab"))).resolves.toMatchObject({ ok: false, reason: expect.stringContaining("provider") });
    await expect(checker.prepare({ ...inlineRequest(), description: "first line\nsecond line" }))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining("description file") });
  });

  it("blocks a file when the approved text and encoded bytes do not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "request-input-check-"));
    directories.push(root);
    await writeFile(join(root, "request.md"), "file content");
    const checker = new ReviewRequestInputChecker(
      fakeGit({ branch: "feature/example", origin: "https://github.com/owner/repo.git" }), root, "github",
    );
    const draft: RequestStageDraft = {
      ...inlineRequest(),
      description: "approved text",
      descriptionInput: { kind: "file", path: "request.md", contentBase64: Buffer.from("different text").toString("base64") },
    };
    await expect(checker.prepare(draft)).resolves.toMatchObject({ ok: false });
  });
});
