import { isToolCallEventType, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { errorMessage, HeraldError } from "../../application/errors.js";
import { prepareHeraldRun } from "../../application/use-cases/prepare-herald-run.js";
import type { GitRepositoryPort } from "../../application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../../application/ports/hosting-provider-port.js";
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
  let gitIntegrationActive = false;
  let activeProvider: HostingProvider | null = null;

  pi.on("tool_call", async (event, ctx) => {
    if (!gitIntegrationActive || !isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    const hasCommit = /\bgit\b[^;\n|]*\bcommit\b/.test(command);
    const hasPush = /\bgit\b[^;\n|]*\bpush\b/.test(command);
    const hasGitLabRequest = activeProvider === "gitlab" && /\bglab\b[^;\n|]*\bmr\s+create\b/.test(command);
    const hasGitHubRequest = activeProvider === "github" && /\bgh\b[^;\n|]*\bpr\s+create\b/.test(command);
    const actions = [
      hasCommit && "create a Git commit",
      hasPush && "push Git changes",
      hasGitLabRequest && "create a GitLab merge request",
      hasGitHubRequest && "create a GitHub pull request",
    ].filter((action): action is string => Boolean(action));
    if (actions.length === 0) return;

    const actionLabel = actions.join(", ").replace(/, ([^,]*)$/, ", and $1");
    const approved = ctx.hasUI && await ctx.ui.confirm(
      "Git integration approval required",
      `Allow Git Integration to ${actionLabel}?`,
    );
    if (!approved) {
      return {
        block: true,
        reason: `Git Integration blocked the request to ${actionLabel}.`,
      };
    }
  });

  pi.on("agent_settled", () => {
    gitIntegrationActive = false;
    activeProvider = null;
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
      await handleHeraldCommand(pi, args, ctx, createAdapters, (instructions, provider) => {
        pendingInstructions = instructions;
        activeProvider = provider;
        gitIntegrationActive = true;
      });
    },
  });
}

async function handleHeraldCommand(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
  createAdapters: HeraldAdapterFactory,
  arm: (instructions: string, provider: HostingProvider | null) => void,
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
    arm(renderGitIntegrationInstructions(prepared.provider), prepared.provider);
    pi.sendUserMessage(renderHeraldTask(prepared));
  } catch (error) {
    const message = error instanceof HeraldError
      ? error.message
      : `Could not collect Git context: ${errorMessage(error)}`;
    ctx.ui.notify(message, "error");
  }
}
