import { isToolCallEventType, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { errorMessage, HeraldError } from "../../application/errors.js";
import { prepareHeraldRun } from "../../application/use-cases/prepare-herald-run.js";
import type { GitRepositoryPort } from "../../application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../../application/ports/hosting-provider-port.js";
import type { GitMode } from "../../domain/git-mode.js";
import type { HostingProvider } from "../../domain/hosting-provider.js";
import { parseHeraldMode } from "./mode-parser.js";
import { renderGitIntegrationInstructions } from "./render-instructions.js";
import { renderHeraldTask } from "./render-task.js";

export interface HeraldAdapters {
  git: GitRepositoryPort;
  hosting: HostingProviderPort;
}

export type HeraldAdapterFactory = (cwd: string) => HeraldAdapters;

export function registerGitIntegration(pi: ExtensionAPI, createAdapters: HeraldAdapterFactory): void {
  let pendingInstructions: string | null = null;
  let activeRun: { mode: GitMode; provider: HostingProvider | null } | null = null;

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

  pi.on("agent_settled", () => {
    activeRun = null;
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
      await handleHeraldCommand(pi, args, ctx, createAdapters, (instructions, mode, provider) => {
        pendingInstructions = instructions;
        activeRun = { mode, provider };
      });
    },
  });
}

async function handleHeraldCommand(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
  createAdapters: HeraldAdapterFactory,
  arm: (instructions: string, mode: GitMode, provider: HostingProvider | null) => void,
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
    const adapters = createAdapters(ctx.cwd);
    const prepared = await prepareHeraldRun({
      mode,
      git: adapters.git,
      hosting: adapters.hosting,
    });

    ctx.ui.notify(`Herald — ${mode} mode`, "info");
    arm(renderGitIntegrationInstructions(prepared.provider), mode, prepared.provider);
    pi.sendUserMessage(renderHeraldTask(prepared));
  } catch (error) {
    const message = error instanceof HeraldError
      ? error.message
      : `Could not collect Git context: ${errorMessage(error)}`;
    ctx.ui.notify(message, "error");
  }
}
