import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
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
    originUrl: async () => null,
    snapshot: async () => ({ branch: "feature/test", status: " M file", stagedDiff: "", unstagedDiff: "change", recentCommits: "" }),
    refExists: async () => false,
    diffAgainst: async () => "",
  },
  hosting: { resolve: async () => "github", defaultBranch: async () => "main" },
});

async function setup(options: { hold?: boolean; delayEvents?: boolean } = {}) {
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
  const requests: Array<{ model: string; thinking: string | undefined }> = [];
  let respond: () => void = () => { throw new Error("No request is active"); };
  runtime.registerProvider("herald-test", {
    api: "openai-completions", baseUrl: "http://unused.invalid", apiKey: "dummy-local-test-key",
    models: ["chat", "run", "manual"].map((id) => ({
      id, name: id, reasoning: true, input: ["text"], contextWindow: 100000, maxTokens: 1000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
    streamSimple: (model, _context, streamOptions) => {
      requests.push({ model: model.id, thinking: streamOptions?.reasoning });
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", api: "openai-completions", provider: model.provider, model: model.id,
        content: [{ type: "text", text: "No Git actions performed." }], stopReason: "stop", timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      respond = () => { stream.push({ type: "done", reason: "stop", message }); stream.end(); };
      streamOptions?.signal?.addEventListener("abort", () => {
        const error = { ...message, stopReason: "aborted" as const, errorMessage: "Cancelled by test" };
        stream.push({ type: "error", reason: "aborted", error });
        stream.end();
      }, { once: true });
      if (!options.hold) queueMicrotask(respond);
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
        registerGitIntegration(api, adapters, new FileHeraldSettings(getAgentDir()));
      },
    ],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd, agentDir, modelRuntime: runtime, model: runtime.getModel("herald-test", "chat"), thinkingLevel: "high",
    resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd), settingsManager, tools: [],
  });
  sessions.push(session);
  expect(extensionsResult.errors).toEqual([]);
  const errors: unknown[] = [];
  await session.bindExtensions({
    uiContext: { notify: vi.fn(), confirm: async () => false } as unknown as ExtensionUIContext,
    onError: (error) => errors.push(error),
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
    } as Parameters<AgentSession["bindExtensions"]>[0]["commandContextActions"],
  });
  return { session, runtime, requests, errors, settingsPath, content, respond: () => respond() };
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
  it("uses and restores selections without changing file settings", async () => {
    const h = await setup({ delayEvents: true });
    await waitForSettled(h.session, () => h.session.prompt("/herald commit"));
    expect(h.requests).toEqual([{ model: "run", thinking: "low" }]);
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
