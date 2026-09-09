import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GitCliAdapter } from "./adapters/git/git-cli-adapter.js";
import { GitHubHostingAdapter } from "./adapters/hosting/github-adapter.js";
import { GitLabHostingAdapter } from "./adapters/hosting/gitlab-adapter.js";
import { HostingProviderRegistry } from "./adapters/hosting/provider-registry.js";
import { registerGitIntegration } from "./adapters/pi/extension.js";
import { PiProcessRunner } from "./adapters/process/process-runner.js";

export default function gitIntegrationExtension(pi: ExtensionAPI): void {
  registerGitIntegration(pi, (cwd) => {
    const runner = new PiProcessRunner(pi, cwd);
    return {
      git: new GitCliAdapter(runner),
      hosting: new HostingProviderRegistry([
        new GitHubHostingAdapter(runner),
        new GitLabHostingAdapter(runner),
      ]),
    };
  });
}
