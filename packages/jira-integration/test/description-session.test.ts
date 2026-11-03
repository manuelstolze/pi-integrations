import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createDescriptionUpdates } from "../src/application/use-cases/update-description.js";
import { DescriptionConversationAdapter } from "../src/interface/pi/description-conversation-adapter.js";
import { registerDescriptionUpdateTool } from "../src/interface/pi/register-description-update-tool.js";
import { doc, harness, snapshot } from "./description-fixtures.js";

it("requires a fresh receipt after reload but keeps an unattempted proposal", () => {
  const h = harness(); const p = h.conversation.create(snapshot(), doc()); h.publish(p); h.user(`Approve Jira update ${p.id}`);
  const next = harness(h.manager);
  expect(next.conversation.consume(p.id)).toBeUndefined();
  next.user(`Approve Jira update ${p.id}`);
  expect(next.conversation.consume(p.id)).toEqual(p);
});
it("does not resurrect consumed approval on an older branch", () => {
  const h = harness(); const p = h.conversation.create(snapshot(), doc()); const preview = h.publish(p);
  h.user(`Approve Jira update ${p.id}`); expect(h.conversation.consume(p.id)).toBeDefined();
  h.manager.branch(preview); h.conversation.reset(); h.user(`Approve Jira update ${p.id}`);
  expect(h.conversation.consume(p.id)).toBeUndefined();
});
it("does not copy a proposal to another session ID", () => {
  const h = harness(); const p = h.conversation.create(snapshot(), doc()); h.publish(p);
  const other = SessionManager.inMemory();
  other.appendCustomEntry("jira-description-update", { event: "proposal", proposalId: p.id, proposal: p });
  const next = harness(other); next.publish(p); next.user(`Approve Jira update ${p.id}`);
  expect(next.conversation.consume(p.id)).toBeUndefined();
});

describe("actual Pi session input ordering with fake Jira", () => {
  it.each(["tui", "rpc", "json", "print"] as const)("prepares and approves in %s without a dialog", async (mode) => {
    await sessionFlow(mode, false);
  });
  it.each(["json", "print"] as const)("continues a saved %s session with a fresh user approval", async (mode) => {
    await sessionFlow(mode, true);
  });
});

async function sessionFlow(mode: "tui" | "rpc" | "json" | "print", resume: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "pi-jira-session-test-"));
  const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const runtime = await ModelRuntime.create({ authPath: join(directory, "auth.json"), modelsPath: null, modelsStorePath: join(directory, "models-cache.json"), refreshOnCreate: false });
  vi.spyOn(runtime, "hasConfiguredAuth").mockReturnValue(true);
  const model = runtime.getModels()[0]!;
  expect(model).toBeDefined();
  let saved = snapshot();
  const jira = { readDescription: vi.fn(async () => structuredClone(saved)), replaceDescription: vi.fn(async (p) => { saved.descriptionDocument = p.description; return {}; }) };
  const factory: ExtensionFactory = (pi) => {
    const conversation = new DescriptionConversationAdapter((type, data) => pi.appendEntry(type, data));
    registerDescriptionUpdateTool(pi, createDescriptionUpdates(jira, conversation), conversation, async (value) => JSON.stringify(value));
    pi.on("input", (event, context) => { conversation.input(event, context); return { action: "continue" }; });
    pi.on("session_start", (_event, context) => { conversation.reset(); conversation.bind(context); });
    pi.on("session_tree", (_event, context) => { conversation.reset(); conversation.bind(context); });
  };
  async function open(manager: SessionManager) {
    const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [factory] });
    await loader.reload();
    const { session } = await createAgentSession({ cwd: directory, agentDir: directory, settingsManager: settings, modelRuntime: runtime, model, resourceLoader: loader, sessionManager: manager, noTools: "builtin" });
    await session.bindExtensions({ mode });
    const actions: Array<Record<string, unknown> | null> = [];
    session.agent.streamFunction = () => {
      const action = actions.shift();
      const content = action ? [{ type: "toolCall", id: `call-${Date.now()}`, name: "jira_update_description", arguments: action }] : [{ type: "text", text: "Review the proposal and reply with its approval sentence." }];
      const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content, stopReason: action ? "toolUse" : "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => { stream.push({ type: "start", partial: message as never }); stream.push({ type: "done", reason: action ? "toolUse" : "stop", message: message as never }); stream.end(); });
      return stream;
    };
    return { session, actions };
  }
  let manager = resume ? SessionManager.create(directory, directory) : SessionManager.inMemory(directory);
  let active: Awaited<ReturnType<typeof open>> | undefined;
  try {
    active = await open(manager);
    active.actions.push({ action: "prepare", issueKey: "D3X-123", description: doc() }, null);
    await active.session.prompt("Prepare a description replacement", { source: mode === "rpc" ? "rpc" : "interactive" });
    expect(jira.replaceDescription).not.toHaveBeenCalled();
    const preview = manager.getBranch().find((e) => e.type === "message" && e.message.role === "toolResult" && e.message.toolName === "jira_update_description");
    expect(preview).toBeDefined();
    const details = preview!.type === "message" && preview!.message.role === "toolResult" ? preview!.message.details as { proposalId: string; status: string } : undefined;
    expect(details?.status).toBe("pending-approval");
    if (resume) {
      const file = manager.getSessionFile()!;
      active.session.dispose(); active = undefined;
      manager = SessionManager.open(file, directory);
      active = await open(manager);
    }
    active.actions.push({ action: "apply", proposalId: details!.proposalId }, null);
    await active.session.prompt(`Approve Jira update ${details!.proposalId}`, { source: mode === "rpc" ? "rpc" : "interactive" });
    const outcomes = manager.getBranch().filter((e) => e.type === "message" && e.message.role === "toolResult");
    const last = outcomes.at(-1)!;
    expect(last.type === "message" && last.message.role === "toolResult" ? last.message.details : undefined).toMatchObject({ status: "verified", writeAttempted: true });
    expect(jira.replaceDescription).toHaveBeenCalledTimes(1);
  } finally {
    active?.session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
