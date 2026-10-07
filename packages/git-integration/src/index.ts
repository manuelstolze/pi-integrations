import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GitCliAdapter } from "./infrastructure/git/git-cli-adapter.js";
import { GitHubHostingAdapter } from "./infrastructure/hosting/github-adapter.js";
import { GitLabHostingAdapter } from "./infrastructure/hosting/gitlab-adapter.js";
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
      hosting: new HostingProviderRegistry([
        new GitHubHostingAdapter(runner),
        new GitLabHostingAdapter(runner),
      ]),
    };
  });
}
