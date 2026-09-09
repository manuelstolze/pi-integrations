import type { GitRepositoryPort, RepositorySnapshot } from "../../application/ports/git-repository-port.js";
import type { ProcessResult, ProcessRunner } from "../process/process-runner.js";

export class GitCliAdapter implements GitRepositoryPort {
  constructor(private readonly runner: ProcessRunner) {}

  async isRepository(): Promise<boolean> {
    const result = await this.runner.run("git", ["rev-parse", "--git-dir"]);
    return result.code === 0;
  }

  async originUrl(): Promise<string | null> {
    const result = await this.runner.run("git", ["remote", "get-url", "origin"]);
    return result.code === 0 && result.stdout ? result.stdout : null;
  }

  async snapshot(): Promise<RepositorySnapshot> {
    const [statusResult, stagedResult, unstagedResult, logResult, branchResult] = await Promise.all([
      this.runner.run("git", ["status", "--short"]),
      this.runner.run("git", ["diff", "--cached"]),
      this.runner.run("git", ["diff"]),
      this.runner.run("git", ["log", "--oneline", "-15"]),
      this.runner.run("git", ["branch", "--show-current"]),
    ]);

    return {
      status: requiredOutput(statusResult, ["status", "--short"]),
      stagedDiff: requiredOutput(stagedResult, ["diff", "--cached"]),
      unstagedDiff: requiredOutput(unstagedResult, ["diff"]),
      recentCommits: optionalLogOutput(logResult),
      branch: requiredOutput(branchResult, ["branch", "--show-current"]),
    };
  }

  async refExists(ref: string): Promise<boolean> {
    const result = await this.runner.run("git", ["rev-parse", "--verify", ref]);
    return result.code === 0;
  }

  async diffAgainst(ref: string): Promise<string> {
    return requiredOutput(
      await this.runner.run("git", ["diff", `${ref}...HEAD`]),
      ["diff", `${ref}...HEAD`],
    );
  }
}

function gitFailure(result: ProcessResult, args: string[]): Error {
  const detail = result.stderr || `exit code ${result.code}`;
  return new Error(`git ${args.join(" ")} failed: ${detail}`);
}

function requiredOutput(result: ProcessResult, args: string[]): string {
  if (result.code !== 0) throw gitFailure(result, args);
  return result.stdout;
}

function optionalLogOutput(result: ProcessResult): string {
  if (result.code === 0) return result.stdout;
  if (result.stderr.includes("does not have any commits yet")) return "";
  throw gitFailure(result, ["log", "--oneline", "-15"]);
}
