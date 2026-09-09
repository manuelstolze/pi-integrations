import type { ProcessRunner } from "../process/process-runner.js";
import type { HostingAdapter } from "./hosting-adapter.js";

export class GitLabHostingAdapter implements HostingAdapter {
  readonly provider = "gitlab" as const;

  constructor(private readonly runner: ProcessRunner) {}

  async validateAccess(): Promise<void> {
    const result = await this.runner.run("glab", ["repo", "view", "--output", "json"]);
    if (result.code === 0) return;

    const detail = result.stderr || `exit code ${result.code}`;
    throw new Error(`Could not identify the Git hosting provider with glab: ${detail}`);
  }

  async defaultBranch(): Promise<string | null> {
    return null;
  }
}
