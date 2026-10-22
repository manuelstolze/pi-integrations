import { Type } from "@earendil-works/pi-ai";
import { isToolCallEventType, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { errorMessage, HeraldError } from "../../application/errors.js";
import { prepareHeraldRun } from "../../application/use-cases/prepare-herald-run.js";
import type { GitRepositoryPort } from "../../application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../../application/ports/hosting-provider-port.js";
import type { GitMode } from "../../domain/git-mode.js";
import type { HostingProvider } from "../../domain/hosting-provider.js";
import type { HeraldSettingsPort } from "../../application/ports/herald-settings-port.js";
import { resolveHeraldSettings } from "../../domain/herald-settings.js";
import { HeraldModelController } from "./herald-model-controller.js";
import { parseHeraldMode } from "./mode-parser.js";
import { renderGitIntegrationInstructions } from "./render-instructions.js";
import { renderHeraldTask } from "./render-task.js";

export interface HeraldAdapters {
  git: GitRepositoryPort;
  hosting: HostingProviderPort;
}

export type HeraldAdapterFactory = (cwd: string) => HeraldAdapters;

const FINISH_TOOL = "herald_finish";
type WorkflowResult = "completed" | "failed" | "cancelled";
interface ActiveRun {
  mode: GitMode;
  provider: HostingProvider | null;
  sessionId: string;
  instructions: string;
  ownsFinishTool: boolean;
  result?: WorkflowResult;
  outcome?: "completed" | "aborted" | "error";
}

export function registerGitIntegration(
  pi: ExtensionAPI,
  createAdapters: HeraldAdapterFactory,
  settings: HeraldSettingsPort = { read: async () => ({ sources: [], problems: [] }) },
): void {
  const models = new HeraldModelController(pi);
  let activeRun: ActiveRun | null = null;
  let starting: Promise<void> | null = null;
  let finishing: Promise<void> | null = null;
  let cancelling: Promise<void> | null = null;
  let closing = false;
  let generation = 0;

  const clear = (ctx: ExtensionContext) => {
    if (activeRun?.ownsFinishTool) {
      pi.setActiveTools(pi.getActiveTools().filter((name) => name !== FINISH_TOOL));
    }
    activeRun = null;
    ctx.ui.setStatus("herald", undefined);
  };
  const finish = (ctx: ExtensionContext): Promise<void> => {
    if (finishing) return finishing;
    finishing = models.restore(ctx).finally(() => {
      clear(ctx);
      finishing = null;
    });
    return finishing;
  };

  const cancel = (ctx: ExtensionCommandContext): Promise<void> => {
    if (cancelling) return cancelling;
    if (!starting && !activeRun && !finishing) {
      ctx.ui.notify("No Herald workflow is active.", "info");
      return Promise.resolve();
    }
    generation += 1;
    const pending = starting;
    const running = activeRun !== null;
    cancelling = (async () => {
      if (running && !ctx.isIdle()) ctx.abort();
      await pending;
      if (running) await ctx.waitForIdle();
      await finish(ctx);
      ctx.ui.notify("Herald cancelled. Completed Git actions were not reversed.", "info");
    })().finally(() => { cancelling = null; });
    return cancelling;
  };

  pi.registerTool({
    name: FINISH_TOOL,
    label: "Finish Herald",
    description: "Report the end of the active Herald workflow. Do not call while waiting for approval or revisions.",
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    parameters: Type.Object({
      status: Type.Union([Type.Literal("completed"), Type.Literal("failed"), Type.Literal("cancelled")]),
      summary: Type.String({ description: "Short account of the workflow result." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!activeRun || activeRun.sessionId !== ctx.sessionManager.getSessionId()) {
        return { isError: true, content: [{ type: "text", text: "No Herald workflow is active in this session." }], details: undefined };
      }
      activeRun.result ??= params.status;
      return {
        content: [{ type: "text", text: `Herald result recorded: ${activeRun.result}. Give the final summary without further Git mutations.` }],
        details: { status: activeRun.result, summary: params.summary },
      };
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!activeRun || !isToolCallEventType("bash", event)) return;

    const run = activeRun;
    const command = event.input.command;
    const actions = [
      {
        detected: /\bgit\b[^;\n|]*\bcommit\b/.test(command),
        label: "create a Git commit",
        allowed: activeRun.mode === "commit" || activeRun.mode === "full",
      },
      {
        detected: /\bgit\b[^;\n|]*\bpush\b/.test(command),
        label: "push Git changes",
        allowed: activeRun.mode === "request" || activeRun.mode === "full",
      },
      {
        detected: /\bglab\b[^;\n|]*\bmr\s+create\b/.test(command),
        label: "create a GitLab merge request",
        allowed: activeRun.mode === "request" || activeRun.mode === "full",
      },
      {
        detected: /\bgh\b[^;\n|]*\bpr\s+create\b/.test(command),
        label: "create a GitHub pull request",
        allowed: activeRun.mode === "request" || activeRun.mode === "full",
      },
    ].filter((action) => action.detected);
    if (actions.length === 0) return;
    if (activeRun.result) {
      return { block: true, reason: "Herald has reported its result. Further Git mutations are blocked until cleanup." };
    }

    const blockedActions = actions.filter((action) => !action.allowed);
    if (blockedActions.length > 0) {
      const actionLabel = blockedActions.map((action) => action.label).join(", ");
      return {
        block: true,
        reason: `Git Integration blocked ${actionLabel} in ${activeRun.mode} mode.`,
      };
    }

    const approved = ctx.hasUI && await ctx.ui.confirm(
      "Git integration approval required",
      `Allow this command to run?\n\n${command}`,
    );
    if (!approved || activeRun !== run || cancelling || run.result || ctx.signal?.aborted) {
      return {
        block: true,
        reason: "Git Integration blocked the command because approval was not granted.",
      };
    }
  });

  pi.on("agent_before_settle", (event) => {
    if (activeRun) activeRun.outcome = event.outcome;
  });

  pi.on("agent_settled", async (event, ctx) => {
    if (activeRun && (activeRun.result || event.aborted || activeRun.outcome === "error" || activeRun.outcome === "aborted")) {
      await finish(ctx);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    closing = true;
    generation += 1;
    await starting;
    await finish(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!activeRun || activeRun.sessionId !== ctx.sessionManager.getSessionId()) return;
    activeRun.outcome = undefined;
    return {
      systemPrompt: `${event.systemPrompt}\n\n---\n\n${activeRun.instructions}`,
    };
  });

  pi.registerCommand("herald", {
    description: "Git commit and review-request agent · [commit|request|cancel] or full",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      if (args.trim().toLowerCase() === "cancel") {
        await cancel(ctx);
        return;
      }
      if (starting || activeRun || finishing || cancelling || closing) {
        ctx.ui.notify("Herald is already running or closing. Wait for completion or use /herald cancel before starting another run.", "warning");
        return;
      }
      const currentGeneration = generation;
      const sessionId = ctx.sessionManager.getSessionId();
      const isCurrent = () => generation === currentGeneration && ctx.sessionManager.getSessionId() === sessionId;
      starting = handleHeraldCommand(pi, args, ctx, createAdapters, settings, models, isCurrent,
        (instructions, mode, provider) => {
          const activeTools = pi.getActiveTools();
          activeRun = { mode, provider, sessionId, instructions, ownsFinishTool: !activeTools.includes(FINISH_TOOL) };
          pi.setActiveTools([...new Set([...activeTools, FINISH_TOOL])]);
          ctx.ui.setStatus("herald", `Herald: ${mode} — /herald cancel to exit`);
        },
        () => clear(ctx),
      ).finally(() => { starting = null; });
      await starting;
    },
  });
}

async function handleHeraldCommand(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
  createAdapters: HeraldAdapterFactory,
  settings: HeraldSettingsPort,
  models: HeraldModelController,
  isCurrent: () => boolean,
  arm: (instructions: string, mode: GitMode, provider: HostingProvider | null) => void,
  disarm: () => void,
): Promise<void> {
  if (!ctx.hasUI) return;

  let mode;
  try {
    mode = parseHeraldMode(args);
  } catch (error) {
    ctx.ui.notify(errorMessage(error), "error");
    return;
  }

  try {
    await ctx.waitForIdle();
    if (!isCurrent()) return;
    const snapshot = await settings.read({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });
    if (!isCurrent()) return;
    const resolved = resolveHeraldSettings(snapshot.sources);
    resolved.problems.unshift(...snapshot.problems);
    const adapters = createAdapters(ctx.cwd);
    const prepared = await prepareHeraldRun({
      mode,
      git: adapters.git,
      hosting: adapters.hosting,
    });

    if (!isCurrent()) return;
    if (resolved.model || resolved.thinkingLevel || resolved.problems.length > 0) {
      await models.start(ctx, resolved);
      if (!isCurrent()) return;
    }
    ctx.ui.notify(`Herald — ${mode} mode`, "info");
    arm(renderGitIntegrationInstructions(prepared.provider), mode, prepared.provider);
    pi.sendUserMessage(renderHeraldTask(prepared));
  } catch (error) {
    await models.restore(ctx);
    disarm();
    if (!isCurrent()) return;
    const message = error instanceof HeraldError
      ? error.message
      : `Could not collect Git context: ${errorMessage(error)}`;
    ctx.ui.notify(message, "error");
  }
}
