import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunner } from "../src/infrastructure/process/process-runner.js";
import { GitCommitInputChecker } from "../src/infrastructure/git/git-commit-input-checker.js";

const execFileAsync = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createRepository(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "git-commit-input-check-"));
  repositories.push(root);
  await run(root, "git", ["init", "-q"]);
  await run(root, "git", ["config", "user.name", "T04 Test"]);
  await run(root, "git", ["config", "user.email", "t04@example.invalid"]);
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), contents);
  }
  await run(root, "git", ["add", "--all"]);
  await run(root, "git", ["commit", "-m", "initial test state"]);
  return root;
}

function processRunner(cwd: string): ProcessRunner {
  return {
    async run(command, args, options): Promise<ProcessResult> {
      try {
        const result = await execFileAsync(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
        const trim = options?.trimOutput !== false;
        return {
          stdout: trim ? result.stdout.trim() : result.stdout,
          stderr: trim ? result.stderr.trim() : result.stderr,
          code: 0,
        };
      } catch (error) {
        const result = error as Error & { code?: number | string; stdout?: string; stderr?: string };
        const trim = options?.trimOutput !== false;
        return {
          stdout: trim ? (result.stdout ?? "").trim() : result.stdout ?? "",
          stderr: trim ? (result.stderr ?? "").trim() : result.stderr ?? "",
          code: typeof result.code === "number" ? result.code : -1,
        };
      }
    },
  };
}

async function run(cwd: string, command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, { cwd, encoding: "utf8" });
  return result.stdout;
}

const oneFileDraft = (file: string) => ({
  stage: "commit" as const,
  commits: [{ message: "approved commit", files: [file] }],
});

const stateChanges = [
  {
    name: "staged content",
    setup: async (root: string) => {
      await writeFile(join(root, "file.txt"), "approved staged content\n");
      await run(root, "git", ["add", "--", "file.txt"]);
    },
    change: async (root: string) => writeFile(join(root, "file.txt"), "changed staged content\n"),
  },
  {
    name: "unstaged content",
    setup: async (root: string) => writeFile(join(root, "file.txt"), "approved unstaged content\n"),
    change: async (root: string) => writeFile(join(root, "file.txt"), "changed unstaged content\n"),
  },
  {
    name: "an added file",
    setup: async (root: string) => writeFile(join(root, "new.txt"), "approved added content\n"),
    change: async (root: string) => writeFile(join(root, "new.txt"), "changed added content\n"),
    file: "new.txt",
  },
  {
    name: "a deleted file",
    setup: async (root: string) => unlink(join(root, "file.txt")),
    change: async (root: string) => writeFile(join(root, "file.txt"), "restored after approval\n"),
  },
  {
    name: "binary content",
    setup: async (root: string) => writeFile(join(root, "file.txt"), Buffer.from([0, 1, 2, 255])),
    change: async (root: string) => writeFile(join(root, "file.txt"), Buffer.from([0, 1, 3, 255])),
  },
  {
    name: "partially staged content",
    setup: async (root: string) => {
      await writeFile(join(root, "file.txt"), "staged line\noriginal line\n");
      await run(root, "git", ["add", "--", "file.txt"]);
      await writeFile(join(root, "file.txt"), "staged line\nunstaged line\n");
    },
    change: async (root: string) => writeFile(join(root, "file.txt"), "changed staged line\nunstaged line\n"),
  },
];

describe("GitCommitInputChecker", () => {
  it.each(stateChanges)("blocks changes to $name after approval", async ({ setup, change, file }) => {
    const root = await createRepository({ "file.txt": "initial content\n" });
    await setup(root);
    const checker = new GitCommitInputChecker(processRunner(root), root);
    const prepared = await checker.prepare(oneFileDraft(file ?? "file.txt"));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const command = prepared.proposal.commits[0].command;
    await expect(checker.verify(prepared.proposal, 0)).resolves.toEqual({ ok: true });
    await change(root);
    await expect(checker.verify(prepared.proposal, 0)).resolves.toMatchObject({ ok: false });
    expect(command).toContain("git add --");
    expect(command).toContain("git commit -m 'approved commit'");
  });

  it("checks every commit in order after the earlier commit changes HEAD", async () => {
    const root = await createRepository({ "first.txt": "first original\n", "second.txt": "second original\n" });
    await writeFile(join(root, "first.txt"), "first approved\n");
    await writeFile(join(root, "second.txt"), "second approved\n");
    const checker = new GitCommitInputChecker(processRunner(root), root);
    const prepared = await checker.prepare({
      stage: "commit",
      commits: [
        { message: "first planned commit", files: ["first.txt"] },
        { message: "second planned commit", files: ["second.txt"] },
      ],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(await checker.verify(prepared.proposal, 0)).toEqual({ ok: true });
    await run(root, "bash", ["-c", prepared.proposal.commits[0].command]);
    expect(await readFile(join(root, "first.txt"), "utf8")).toBe("first approved\n");
    expect(await checker.verify(prepared.proposal, 1)).toEqual({ ok: true });
    expect(await run(root, "git", ["show", "--format=", "--name-only", "HEAD"])).toContain("first.txt");
    expect(await run(root, "git", ["show", "--format=", "--name-only", "HEAD"])).not.toContain("second.txt");
  });

  it("rejects staged files outside the first planned commit and overlapping plans", async () => {
    const root = await createRepository({ "first.txt": "first\n", "second.txt": "second\n" });
    await writeFile(join(root, "second.txt"), "second changed\n");
    await run(root, "git", ["add", "--", "second.txt"]);
    const checker = new GitCommitInputChecker(processRunner(root), root);
    const stagedElsewhere = await checker.prepare({
      stage: "commit",
      commits: [
        { message: "first", files: ["first.txt"] },
        { message: "second", files: ["second.txt"] },
      ],
    });
    expect(stagedElsewhere).toMatchObject({ ok: false, reason: expect.stringContaining("outside the first planned commit") });

    const overlap = await checker.prepare({
      stage: "commit",
      commits: [
        { message: "first", files: ["second.txt"] },
        { message: "again", files: ["second.txt"] },
      ],
    });
    expect(overlap).toMatchObject({ ok: false, reason: expect.stringContaining("repeats file path") });
  });

  it("rejects ignored, unsafe, missing, and multiline proposal data", async () => {
    const root = await createRepository({ ".gitignore": "ignored.txt\n", "file.txt": "tracked\n" });
    await writeFile(join(root, "ignored.txt"), "ignored\n");
    const checker = new GitCommitInputChecker(processRunner(root), root);

    await expect(checker.prepare(oneFileDraft("ignored.txt"))).resolves.toMatchObject({
      ok: false, reason: expect.stringContaining("Ignored file"),
    });
    await expect(checker.prepare(oneFileDraft("../outside.txt"))).resolves.toMatchObject({ ok: false });
    await expect(checker.prepare(oneFileDraft("missing.txt"))).resolves.toMatchObject({ ok: false });
    await expect(checker.prepare({
      stage: "commit", commits: [{ message: "line one\nline two", files: ["file.txt"] }],
    })).resolves.toMatchObject({ ok: false, reason: expect.stringContaining("single-line") });
  });
});
