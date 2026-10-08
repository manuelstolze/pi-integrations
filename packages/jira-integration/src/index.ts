import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createJiraUseCases } from "./application/use-cases/jira-tools.js";
import { DEFAULT_COMMAND_TIMEOUT_MS } from "./domain/types.js";
import { JiraCliAdapter, runAcliLogin } from "./infrastructure/jira-cli-adapter.js";
import { registerJiraTools } from "./interface/pi/register-jira-tools.js";

const jiraExtension: ExtensionFactory = (pi) => {
  const gateway = new JiraCliAdapter({
    runCommand: async (args, options) => pi.exec("acli", args, {
      signal: options.signal,
      timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    }),
    login: runAcliLogin,
  });
  registerJiraTools(pi, createJiraUseCases(gateway));
};

export default jiraExtension;

export { JiraClient } from "./infrastructure/jira-client.js";
export { normalizeComment, normalizeIssueDetails, normalizeIssueSummary, normalizeJiraText } from "./infrastructure/public-normalizers.js";
export { JiraToolError } from "./application/errors.js";
export type { JiraClientOptions, JiraCommandOptions, JiraCommandResult, JiraCommandRunner, JiraLoginCredentials, JiraLoginRunner } from "./infrastructure/jira-client.js";
export type { JiraComment, JiraCommentsResult, JiraIssueDetails, JiraIssueSummary, JiraSearchResult } from "./domain/types.js";
