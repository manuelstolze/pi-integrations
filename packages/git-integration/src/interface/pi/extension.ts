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

export function registerGitIntegration(
  pi: ExtensionAPI,
  createAdapters: HeraldAdapterFactory,
  settings: HeraldSettingsPort = { read: async () => ({ sources: [], problems: [] }) },
): void {
  const models = new HeraldModelController(pi);
  let pendingInstructions: string | null = null;
  let activeRun: { mode: GitMode; provider: HostingProvider | null } | null = null;
  let starting: Promise<void> | null = null;
  let closing = false;
  let generation = 0;

  const finish = async (ctx: ExtensionContext) => {
    await models.restore(ctx);
    activeRun = null;
    pendingInstructions = null;
  };

  pi.on("tool_call", async (event, ctx) => {
    if (!activeRun || !isToolCallEventType("bash", event)) return;

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
    if (!approved) {
      return {
        block: true,
        reason: "Git Integration blocked the command because approval was not granted.",
      };
    }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (activeRun) await finish(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    closing = true;
    generation += 1;
    await starting;
    await finish(ctx);
  });

  pi.on("before_agent_start", async (event) => {
    if (!pendingInstructions) return;
    const instructions = pendingInstructions;
    pendingInstructions = null;
    return {
      systemPrompt: `${event.systemPrompt}\n\n---\n\n${instructions}`,
    };
  });

  pi.registerCommand("herald", {
    description: "Git commit and review-request agent · [commit|request] or full",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      if (starting || activeRun || closing) {
        ctx.ui.notify("Herald is already running or closing. Wait for it to finish before starting another run.", "warning");
        return;
      }
      const currentGeneration = generation;
      const sessionId = ctx.sessionManager.getSessionId();
      const isCurrent = () => generation === currentGeneration && ctx.sessionManager.getSessionId() === sessionId;
      starting = handleHeraldCommand(pi, args, ctx, createAdapters, settings, models, isCurrent,
        (instructions, mode, provider) => {
          pendingInstructions = instructions;
          activeRun = { mode, provider };
        },
        () => { activeRun = null; pendingInstructions = null; },
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
