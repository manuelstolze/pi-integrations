/**
 * pi-git-integration
 *
 * Git commit and MR agent. Reads the current diff, groups changes into logical
 * commits, shows a plan for approval, executes commits, then pushes and creates
 * a GitLab MR — all step by step with explicit approval gates.
 *
 * Usage:
 *   /git          — full flow: commits → push → MR
 *   /git commit   — commit only (no push, no MR)
 *   /git mr       — MR only (assumes commits already done)
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTask, isGitRepo, parseMode } from "./git.js";
import { GIT_INTEGRATION_INSTRUCTIONS } from "./instructions.js";

// ── Extension ──────────────────────────────────────────────────────────────────

export default function gitIntegrationExtension(pi: ExtensionAPI): void {
    let pendingInstructions: string | null = null;
    let gitIntegrationActive = false;

    // Require a Pi confirmation before Git Integration can perform permanent Git actions.
    pi.on("tool_call", async (event, ctx) => {
        if (!gitIntegrationActive || !isToolCallEventType("bash", event)) return;

        const command = event.input.command;
        const hasCommit = /\bgit\b[^;\n|]*\bcommit\b/.test(command);
        const hasPush = /\bgit\b[^;\n|]*\bpush\b/.test(command);
        const hasMergeRequest = /\bglab\b[^;\n|]*\bmr\s+create\b/.test(command);
        const actions = [
            hasCommit && "create a Git commit",
            hasPush && "push Git changes",
            hasMergeRequest && "create a GitLab merge request",
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

    pi.registerCommand("git", {
        description: "Git commit and MR agent · [commit|mr] or both",
        handler: async (args, ctx) => {
            if (!ctx.hasUI) return;

            if (!(await isGitRepo(pi, ctx.cwd))) {
                ctx.ui.notify("Not a git repository.", "error");
                return;
            }

            const mode = parseMode(args);
            ctx.ui.notify(`Git Integration starting — ${mode} mode`, "info");

            let task: string;
            try {
                task = await buildTask(pi, mode, ctx.cwd);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                ctx.ui.notify(`Could not collect Git context: ${message}`, "error");
                return;
            }

            // Arm the system prompt injection for the next agent turn.
            pendingInstructions = GIT_INTEGRATION_INSTRUCTIONS;
            gitIntegrationActive = true;

            // Fire the task into the agent.
            pi.sendUserMessage(task);
        },
    });
}