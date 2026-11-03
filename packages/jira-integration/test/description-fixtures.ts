import { SessionManager, type InputEvent } from "@earendil-works/pi-coding-agent";
import { DescriptionConversationAdapter } from "../src/interface/pi/description-conversation-adapter.js";
import type { DescriptionProposal, DescriptionSnapshot } from "../src/domain/description-update.js";

export const doc = (text = "New description") => ({ type: "doc" as const, version: 1 as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
export const snapshot = (): DescriptionSnapshot => ({
  target: { site: "example.atlassian.net", account: "user@example.com" },
  issue: { key: "D3X-123", summary: "Example", type: "Story", status: "To Do", assignee: null, priority: null, reporter: null, labels: [], created: null, updated: null, description: "Original" },
  descriptionDocument: doc("Original"),
});
export function harness(manager = SessionManager.inMemory()) {
  const conversation = new DescriptionConversationAdapter((type, value) => manager.appendCustomEntry(type, value));
  const context = { sessionManager: manager };
  conversation.bind(context);
  return {
    manager, context, conversation,
    publish(proposal: DescriptionProposal) {
      return manager.appendMessage({ role: "toolResult", toolName: "jira_update_description", toolCallId: "prepare-call", content: [{ type: "text", text: JSON.stringify(proposal) }], details: { status: "pending-approval", proposalId: proposal.id, proposal }, isError: false, timestamp: Date.now() });
    },
    user(text: string, source: InputEvent["source"] = "interactive", storedText = text) {
      conversation.input({ type: "input", source, text }, context);
      manager.appendMessage({ role: "user", content: storedText, timestamp: Date.now() });
    },
  };
}
