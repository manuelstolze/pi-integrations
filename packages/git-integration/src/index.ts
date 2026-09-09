/**
 * pi-git-integration
 *
 * Git commit and MR agent. Reads the current diff, groups changes into logical
 * commits, shows a plan for approval, executes commits, then pushes and creates
 * a GitLab MR — all step by step with explicit approval gates.
 *
 * Usage:
 *   /herald             — full flow: commits → push → MR
 *   /herald commit      — commit only (no push, no MR)
 *   /herald request     — request only (assumes commits already done)
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTask, detectHostingProvider, isGitRepo, parseMode } from "./git.js";
import { getGitIntegrationInstructions } from "./instructions.js";
import type { HostingProvider } from "./types.js";

// ── Extension ──────────────────────────────────────────────────────────────────

export default function gitIntegrationExtension(pi: ExtensionAPI): void {
    let pendingInstructions: string | null = null;
    let gitIntegrationActive = false;
    let activeProvider: HostingProvider | null = null;

    // Require a Pi confirmation before Git Integration can perform permanent Git actions.
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
                reason: `Git Integration blocked the request to ${actionLabel}.`
            };
        }
    });

    pi.on("agent_settled", () => {
        gitIntegrationActive = false;
        activeProvider = null;
    });

    // Inject Git Integration instructions into the system prompt before the agent turn runs
    pi.on("before_agent_start", async (event) => {
        if (!pendingInstructions) return;
        const instructions = pendingInstructions;
        pendingInstructions = null;
        return {
            systemPrompt: `${event.systemPrompt}\n\n---\n\n${instructions}`,
        };
    });

    pi.registerCommand("herald", {
        description: "Git commit and MR agent · [commit|request] or full",
        handler: async (args, ctx) => {
            if (!ctx.hasUI) return;

            let mode: ReturnType<typeof parseMode>;
            try {
                mode = parseMode(args);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                ctx.ui.notify(message, "error");
                return;
            }

            if (!(await isGitRepo(pi, ctx.cwd))) {
                ctx.ui.notify("Not a git repository.", "error");
                return;
            }

            ctx.ui.notify(`Herald — ${mode} mode`, "info");

            let provider: HostingProvider | null = null;
            if (mode !== "commit") {
                try {
                    provider = await detectHostingProvider(pi, ctx.cwd);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    ctx.ui.notify(message, "error");
                    return;
                }
            }
            activeProvider = provider;

            let task: string;
            try {
                task = await buildTask(pi, mode, ctx.cwd, provider);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                ctx.ui.notify(`Could not collect Git context: ${message}`, "error");
                return;
            }

            // Arm the system prompt injection for the next agent turn.
            pendingInstructions = getGitIntegrationInstructions(provider);
            gitIntegrationActive = true;

            // Fire the task into the agent.
            pi.sendUserMessage(task);
        },
    });
}