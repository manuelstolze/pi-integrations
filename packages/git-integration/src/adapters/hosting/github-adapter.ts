import type { ProcessRunner } from "../process/process-runner.js";
import type { HostingAdapter } from "./hosting-adapter.js";

export class GitHubHostingAdapter implements HostingAdapter {
  readonly provider = "github" as const;
  private validatedBranch: string | null | undefined;

  constructor(private readonly runner: ProcessRunner) {}

  async validateAccess(): Promise<void> {
    const result = await this.runner.run("gh", [
      "repo",
      "view",
      "--json",
      "defaultBranchRef",
      "--jq",
      ".defaultBranchRef.name",
    ]);
    const branch = result.stdout.trim();
    if (result.code !== 0 || !branch) {
      const detail = result.stderr || `exit code ${result.code}`;
      throw new Error(`Could not validate GitHub access with gh: ${detail}`);
    }
    this.validatedBranch = branch;
  }

  async defaultBranch(): Promise<string | null> {
    if (this.validatedBranch !== undefined) return this.validatedBranch;

    const result = await this.runner.run("gh", [
      "repo",
      "view",
      "--json",
      "defaultBranchRef",
      "--jq",
      ".defaultBranchRef.name",
    ]);
    return result.code === 0 && result.stdout ? result.stdout : null;
  }
}
