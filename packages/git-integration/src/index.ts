import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FileHeraldSettings } from "./infrastructure/config/file-herald-settings.js";
import { GitCliAdapter } from "./infrastructure/git/git-cli-adapter.js";
import { GitCommitInputChecker } from "./infrastructure/git/git-commit-input-checker.js";
import { GitHubHostingAdapter } from "./infrastructure/hosting/github-adapter.js";
import { GitLabHostingAdapter } from "./infrastructure/hosting/gitlab-adapter.js";
import { ReviewRequestInputChecker } from "./infrastructure/hosting/request-input-checker.js";
import { HostingProviderRegistry } from "./infrastructure/hosting/provider-registry.js";
import { ExecProcessRunner } from "./infrastructure/process/process-runner.js";
import { registerGitIntegration } from "./interface/pi/extension.js";

export default function gitIntegrationExtension(pi: ExtensionAPI): void {
  registerGitIntegration(pi, (cwd) => {
    const runner = new ExecProcessRunner(
      (command, args, options) => pi.exec(command, args, options),
      cwd,
    );
    return {
      git: new GitCliAdapter(runner),
      commitInputChecks: new GitCommitInputChecker(runner, cwd),
      requestInputChecks: (provider) => new ReviewRequestInputChecker(runner, cwd, provider),
      hosting: new HostingProviderRegistry([
        new GitHubHostingAdapter(runner),
        new GitLabHostingAdapter(runner),
      ]),
    };
  }, new FileHeraldSettings(getAgentDir()));
}
