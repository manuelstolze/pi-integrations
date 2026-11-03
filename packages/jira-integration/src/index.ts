import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createJiraUseCases } from "./application/use-cases/jira-tools.js";
import { DEFAULT_COMMAND_TIMEOUT_MS } from "./domain/types.js";
import { JiraCliAdapter, runAcliLogin } from "./infrastructure/jira-cli-adapter.js";
import { registerJiraTools } from "./interface/pi/register-jira-tools.js";
import { createDescriptionUpdates } from "./application/use-cases/update-description.js";
import { DescriptionFiles } from "./infrastructure/description-files.js";
import { DescriptionConversationAdapter } from "./interface/pi/description-conversation-adapter.js";
import { createCompleteOutput } from "./interface/pi/complete-output.js";
import { registerDescriptionUpdateTool } from "./interface/pi/register-description-update-tool.js";

const jiraExtension: ExtensionFactory = (pi) => {
  const gateway = new JiraCliAdapter({
    runCommand: async (args, options) => pi.exec("acli", args, {
      signal: options.signal,
      timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    }),
    login: runAcliLogin,
  });
  const files = new DescriptionFiles();
  const conversation = new DescriptionConversationAdapter((type, data) => pi.appendEntry(type, data));
  const output = createCompleteOutput((value) => files.output(value));
  registerJiraTools(pi, createJiraUseCases(gateway, gateway), output);
  registerDescriptionUpdateTool(pi, createDescriptionUpdates(gateway, conversation), conversation, output);
  pi.on("input", (event, context) => {
    conversation.input(event, context);
    return { action: "continue" };
  });
  pi.on("session_start", (_event, context) => { conversation.reset(); conversation.bind(context); });
  pi.on("session_tree", (_event, context) => { conversation.reset(); conversation.bind(context); });
  pi.on("session_shutdown", async () => { conversation.reset(); await files.cleanup(); });
};

export default jiraExtension;

export { JiraClient } from "./infrastructure/jira-client.js";
export { normalizeComment, normalizeIssueDetails, normalizeIssueSummary, normalizeJiraText } from "./infrastructure/public-normalizers.js";
export { JiraToolError } from "./application/errors.js";
export type { JiraClientOptions, JiraCommandOptions, JiraCommandResult, JiraCommandRunner, JiraLoginCredentials, JiraLoginRunner } from "./infrastructure/jira-client.js";
export type { JiraComment, JiraCommentsResult, JiraIssueDetails, JiraIssueSummary, JiraSearchResult } from "./domain/types.js";
