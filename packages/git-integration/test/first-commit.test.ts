import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostingProviderPort } from "../src/application/ports/hosting-provider-port.js";
import { prepareHeraldRun } from "../src/application/use-cases/prepare-herald-run.js";
import { GitCliAdapter } from "../src/infrastructure/git/git-cli-adapter.js";
import { ExecProcessRunner } from "../src/infrastructure/process/process-runner.js";
import { renderHeraldTask } from "../src/interface/pi/render-task.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), "herald-first-commit-"));
  directories.push(directory);
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: join(directory, "no-global-config"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const runner = new ExecProcessRunner((command, args, options) => new Promise((resolve) => {
    execFile(command, args, { ...options, env }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: error ? (typeof error.code === "number" ? error.code : -1) : 0 });
    });
  }), directory);
  async function git(...args: string[]) {
    const result = await runner.run("git", args);
    expect(result.code, result.stderr).toBe(0);
    return result.stdout;
  }
  await git("init", "--template=");
  const file = join(directory, "example.txt");
  await writeFile(file, "staged text\n");
  await git("add", "example.txt");
  await writeFile(file, "staged text\nunstaged text\n");
  return { directory, runner, git };
}

function unusedHosting(): HostingProviderPort {
  return {
    resolve: vi.fn(async () => { throw new Error("Hosting access is not allowed"); }),
    defaultBranch: vi.fn(async () => { throw new Error("Hosting access is not allowed"); }),
  };
}

describe("first-commit preparation with real Git", () => {
  it("prepares and renders a new repository without a remote or hosting access", async () => {
    const { runner, git } = await repository();
    const hosting = unusedHosting();
    const branch = await git("branch", "--show-current");
    const adapter = new GitCliAdapter(runner);
    expect(await adapter.originUrl()).toBeNull();

    const run = await prepareHeraldRun({ mode: "commit", git: adapter, hosting });

    expect(run.snapshot.branch).toBe(branch);
    expect(run.snapshot.status).toBe("AM example.txt");
    expect(run.snapshot.stagedDiff).toContain("+staged text");
    expect(run.snapshot.unstagedDiff).toContain("+unstaged text");
    expect(run.snapshot.recentCommits).toBe("");
    expect(renderHeraldTask(run)).toContain("(no commits yet)");
    expect(hosting.resolve).not.toHaveBeenCalled();
    expect(hosting.defaultBranch).not.toHaveBeenCalled();
  });

  it("retains recent history after the first commit", async () => {
    const { directory, runner, git } = await repository();
    await git(
      "-c", "user.name=Herald Test", "-c", "user.email=herald@example.invalid",
      "-c", `core.hooksPath=${join(directory, "no-hooks")}`, "-c", "commit.gpgsign=false",
      "commit", "--no-verify", "-m", "Initial test commit",
    );

    const run = await prepareHeraldRun({ mode: "commit", git: new GitCliAdapter(runner), hosting: unusedHosting() });

    expect(run.snapshot.recentCommits).toMatch(/^[a-f0-9]+ Initial test commit$/);
    expect(run.snapshot.unstagedDiff).toContain("+unstaged text");
    expect(renderHeraldTask(run)).not.toContain("(no commits yet)");
  });
});
