import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream, Type, type AssistantMessage } from "@earendil-works/pi-ai";
import {
  createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, SettingsManager,
  type AgentSession, type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { registerGitIntegration } from "../src/interface/pi/extension.js";
import { FileHeraldSettings } from "../src/infrastructure/config/file-herald-settings.js";
import type { HeraldAdapters } from "../src/interface/pi/extension.js";

const directories: string[] = [];
const sessions: AgentSession[] = [];
afterEach(async () => {
  sessions.splice(0).forEach((session) => session.dispose());
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const adapters = (): HeraldAdapters => ({
  git: {
    isRepository: async () => true,
    originUrl: async () => "https://github.com/example/repo.git",
    snapshot: async () => ({ branch: "feature/test", status: " M file", stagedDiff: "", unstagedDiff: "change", recentCommits: "" }),
    refExists: async () => false,
    diffAgainst: async () => "",
  },
  hosting: { resolve: async () => "github", defaultBranch: async () => "main" },
});

interface ScriptedResponse {
  text?: string;
  call?: { name: string; arguments: Record<string, unknown> };
  error?: string;
}
const finishResponse: ScriptedResponse = {
  call: { name: "herald_finish", arguments: { status: "completed", summary: "No Git actions needed." } },
};

async function setup(options: { hold?: boolean; delayEvents?: boolean; script?: ScriptedResponse[]; approve?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "herald-supported-host-"));
  directories.push(root);
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  await mkdir(agentDir);
  await mkdir(cwd);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  const settingsPath = join(agentDir, "settings.json");
  const content = JSON.stringify({ herald: { model: "herald-test/run", thinkingLevel: "low" } });
  await writeFile(settingsPath, content);
  const settingsManager = SettingsManager.inMemory({
    defaultThinkingLevel: "medium", compaction: { enabled: false }, retry: { enabled: false },
  });
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false,
  });
  const requests: Array<{ model: string; thinking: string | undefined; system: string }> = [];
  const executed = vi.fn();
  const confirm = vi.fn(async () => options.approve ?? true);
  const setStatus = vi.fn();
  let respond: () => void = () => { throw new Error("No request is active"); };
  runtime.registerProvider("herald-test", {
    api: "openai-completions", baseUrl: "http://unused.invalid", apiKey: "dummy-local-test-key",
    models: ["chat", "run", "manual"].map((id) => ({
      id, name: id, reasoning: true, input: ["text"], contextWindow: 100000, maxTokens: 1000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
    streamSimple: (model, context, streamOptions) => {
      const index = requests.length;
      const response = options.script?.[index] ?? (options.script ? { text: "Final summary." } : index === 0 ? finishResponse : { text: "No Git actions performed." });
      requests.push({ model: model.id, thinking: streamOptions?.reasoning,
        system: JSON.stringify(context.messages.filter((message) => message.role === "system")) });
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", api: "openai-completions", provider: model.provider, model: model.id,
        content: response.call
          ? [{ type: "toolCall", id: `call-${index}`, ...response.call }]
          : [{ type: "text", text: response.text ?? "Final summary." }],
        stopReason: response.call ? "toolUse" : "stop", timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      respond = () => {
        if (response.error) {
          stream.push({ type: "error", reason: "error", error: { ...message, stopReason: "error", errorMessage: response.error } });
        } else {
          stream.push({ type: "done", reason: response.call ? "toolUse" : "stop", message });
        }
        stream.end();
      };
      streamOptions?.signal?.addEventListener("abort", () => {
        const error = { ...message, stopReason: "aborted" as const, errorMessage: "Cancelled by test" };
        stream.push({ type: "error", reason: "aborted", error });
        stream.end();
      }, { once: true });
      if (!options.hold || index > 0) queueMicrotask(respond);
      return stream;
    },
  });
  const loader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true,
    extensionFactories: [
      (api) => {
        if (options.delayEvents) {
          api.on("thinking_level_select", async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
        }
      },
      (api) => {
        api.registerTool({
          name: "bash", label: "Fake Bash", description: "Record a command without executing it.",
          parameters: Type.Object({ command: Type.String() }),
          async execute(_id, args) {
            executed(args.command);
            return { content: [{ type: "text", text: "Test command recorded. No process was started." }], details: undefined };
          },
        });
        registerGitIntegration(api, adapters, new FileHeraldSettings(getAgentDir()));
      },
    ],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd, agentDir, modelRuntime: runtime, model: runtime.getModel("herald-test", "chat"), thinkingLevel: "high",
    resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd), settingsManager, noTools: true,
  });
  sessions.push(session);
  expect(extensionsResult.errors).toEqual([]);
  const errors: unknown[] = [];
  await session.bindExtensions({
    uiContext: { notify: vi.fn(), confirm, setStatus } as unknown as ExtensionUIContext,
    onError: (error) => errors.push(error),
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
    } as Parameters<AgentSession["bindExtensions"]>[0]["commandContextActions"],
  });
  return { session, runtime, requests, errors, settingsPath, content, executed, confirm, setStatus, respond: () => respond() };
}

async function waitForSettled(session: AgentSession, action: () => Promise<unknown>) {
  let unsubscribe: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    unsubscribe = session.subscribe((event) => { if (event.type === "agent_settled") resolve(); });
  });
  try {
    await action();
    await settled;
  } finally {
    unsubscribe();
  }
}

describe("Herald on a supported Pi host", () => {
  it.each(["commit", "request", ""])("keeps the model through a chat approval in mode %j", async (mode) => {
    const command = mode === "request" ? "git push origin HEAD" : "git commit -m approved";
    const h = await setup({ script: [
      { text: "Proposed change. Should I proceed?" },
      { call: { name: "bash", arguments: { command } } },
      finishResponse,
      { text: "Verified test workflow. No real Git action was performed." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt(`/herald ${mode}`.trim()));
    expect(h.session.model?.id).toBe("run");
    expect(h.session.thinkingLevel).toBe("low");
    expect(h.requests).toHaveLength(1);
    expect(h.executed).not.toHaveBeenCalled();
    await waitForSettled(h.session, () => h.session.prompt("Yes, proceed with the proposal."));
    expect(h.requests.map(({ model, thinking }) => ({ model, thinking }))).toEqual([
      { model: "run", thinking: "low" }, { model: "run", thinking: "low" },
      { model: "run", thinking: "low" }, { model: "run", thinking: "low" },
    ]);
    for (const request of h.requests) expect(request.system).toContain("You are **Git Integration**");
    expect(h.confirm).toHaveBeenCalledWith("Git integration approval required", expect.stringContaining(command), undefined);
    expect(h.executed).toHaveBeenCalledWith(command);
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.setStatus).toHaveBeenLastCalledWith("herald", undefined);
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
    await waitForSettled(h.session, () => h.session.prompt("An unrelated chat question."));
    expect(h.requests.at(-1)?.model).toBe("chat");
    expect(h.requests.at(-1)?.system).not.toContain("You are **Git Integration**");
  });

  it("keeps full mode between commit approval and request approval", async () => {
    const h = await setup({ script: [
      { text: "Approve the commit plan?" },
      { call: { name: "bash", arguments: { command: "git commit -m approved" } } },
      { text: "Commit stage done. Approve the review request?" },
      { call: { name: "bash", arguments: { command: "git push origin HEAD && gh pr create --title approved" } } },
      finishResponse,
      { text: "Full workflow done." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald"));
    await waitForSettled(h.session, () => h.session.prompt("Yes, commit."));
    expect(h.session.model?.id).toBe("run");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    await waitForSettled(h.session, () => h.session.prompt("Yes, push and create it."));
    expect(h.confirm).toHaveBeenCalledTimes(2);
    expect(h.executed).toHaveBeenCalledTimes(2);
    expect(h.requests).toHaveLength(6);
    expect(h.requests.every((request) => request.model === "run" && request.thinking === "low")).toBe(true);
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("keeps the command dialog required after chat approval is granted", async () => {
    const h = await setup({ approve: false, script: [
      { text: "Approve the commit plan?" },
      { call: { name: "bash", arguments: { command: "git commit -m approved" } } },
      { text: "The command was denied. Should I revise the plan?" },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await waitForSettled(h.session, () => h.session.prompt("Yes, commit."));
    expect(h.confirm).toHaveBeenCalledOnce();
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.session.model?.id).toBe("run");
    await h.session.prompt("/herald cancel");
    expect(h.session.model?.id).toBe("chat");
    expect(h.errors).toEqual([]);
  });

  it("cancels while waiting for chat approval", async () => {
    const h = await setup({ script: [{ text: "Approve this commit plan?" }] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.session.model?.id).toBe("run");
    await h.session.prompt("/herald cancel");
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it("restores after a terminal provider error without a finish call", async () => {
    const h = await setup({ script: [{ error: "Terminal local test failure" }] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(h.errors).toEqual([]);
  });

  it.each(["model", "thinking"])("preserves manual %s across the approval reply", async (choice) => {
    const h = await setup({ delayEvents: true, script: [
      { text: "Approve this plan?" }, finishResponse, { text: "Final summary." },
    ] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    if (choice === "model") await h.session.setModel(h.runtime.getModel("herald-test", "manual")!);
    else h.session.setThinkingLevel("minimal");
    await waitForSettled(h.session, () => h.session.prompt("Yes, proceed."));
    expect(h.requests[1]).toMatchObject(choice === "model" ? { model: "manual", thinking: "medium" } : { model: "run", thinking: "minimal" });
    expect(h.session.model?.id).toBe(choice === "model" ? "manual" : "chat");
    expect(h.session.thinkingLevel).toBe(choice === "model" ? "medium" : "minimal");
    expect(h.errors).toEqual([]);
  });

  it("cleans up a waiting workflow before reload", async () => {
    const h = await setup({ script: [{ text: "Approve this plan?" }] });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    await h.session.reload();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it("uses and restores selections without changing file settings", async () => {
    const h = await setup({ delayEvents: true });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.errors).toEqual([]);
    expect(JSON.stringify(h.session.messages)).toContain("Herald result recorded");
    expect(h.requests).toHaveLength(2);
    expect(h.requests).toEqual(expect.arrayContaining([expect.objectContaining({ model: "run", thinking: "low" })]));
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });

  it("preserves manual thinking with delayed selection events", async () => {
    const h = await setup({ hold: true, delayEvents: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    h.session.setThinkingLevel("minimal");
    await waitForSettled(h.session, async () => h.respond());
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("minimal");
    expect(h.errors).toEqual([]);
  });

  it("preserves thinking changed away and back before delayed events arrive", async () => {
    const h = await setup({ hold: true, delayEvents: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    h.session.setThinkingLevel("high");
    h.session.setThinkingLevel("low");
    await waitForSettled(h.session, async () => h.respond());
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("low");
    expect(h.errors).toEqual([]);
  });

  it("preserves a manual model choice", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.setModel(h.runtime.getModel("herald-test", "manual")!);
    await waitForSettled(h.session, async () => h.respond());
    expect(h.session.model?.id).toBe("manual");
    expect(h.session.thinkingLevel).toBe("medium");
    expect(h.errors).toEqual([]);
  });

  it("cancels a streaming workflow through the Herald command", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.prompt("/herald cancel");
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.session.getActiveToolNames()).not.toContain("herald_finish");
    expect(h.executed).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
  });

  it("restores selections on cancellation", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.abort();
    await h.session.waitForIdle();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    expect(h.errors).toEqual([]);
  });

  it("restores before the extension runtime is replaced on reload", async () => {
    const h = await setup({ hold: true });
    await h.session.prompt("/herald commit");
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.session.reload();
    expect(h.session.model?.id).toBe("chat");
    expect(h.session.thinkingLevel).toBe("high");
    h.respond();
    await h.session.waitForIdle();
    expect(await readFile(h.settingsPath, "utf8")).toBe(h.content);
    expect(h.errors).toEqual([]);
  });
});
