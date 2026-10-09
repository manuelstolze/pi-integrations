import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PermissionGate } from "../../application/use-cases/permission-gate.js";
import { type ConfirmResult } from "./dialog.js";
import { PiPermissionApprovalAdapter } from "./permission-approval-adapter.js";

export function registerPermissionGate(pi: ExtensionAPI, gate: PermissionGate): void {
  function reportPermissionGate(active: boolean, label?: string): void {
    if (process.env.HERDR_ENV !== "1") return;
    pi.events.emit("herdr:blocked", { active, label });
  }

  pi.on("session_start", (_event, context) => {
    const configError = gate.startSession();
    if (configError) {
      context.ui.notify(
        `Could not read guardrails.json. Using built-in dangerous-command patterns. ${configError.message}`,
        "warning",
      );
    }
  });

  pi.on("tool_call", async (event, context) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    const approval = new PiPermissionApprovalAdapter(
      {
        hasUI: context.hasUI,
        custom: (dialog) => context.ui.custom<ConfirmResult>(dialog),
        select: (title, choices) => context.ui.select(title, choices),
        input: (prompt, defaultValue) => context.ui.input(prompt, defaultValue),
      },
      (description) => reportPermissionGate(true, `Permission gate: ${description}`),
      () => reportPermissionGate(false),
    );
    const outcome = await gate.handleCommand(command, approval);

    switch (outcome.kind) {
      case "allow":
        return;
      case "allow-forever":
        context.ui.notify(
          `Added an exact command to the global allowlist: ${outcome.command.slice(0, 60)}${outcome.command.length > 60 ? "…" : ""}`,
          "info",
        );
        return;
      case "auto-deny":
        context.ui.notify(`Auto-blocked: ${outcome.pattern} — ${outcome.reason}`, "error");
        return { block: true, reason: `Catastrophic command auto-blocked: ${outcome.reason}` };
      case "approval-unavailable":
        return {
          block: true,
          reason: `Dangerous command blocked (no UI to confirm): ${outcome.description}`,
        };
      case "user-deny":
        if (outcome.instruction) {
          pi.sendUserMessage(
            `The command \`${command}\` was blocked. Please do the following instead: ${outcome.instruction}`,
            { deliverAs: "steer" },
          );
        } else {
          context.ui.notify("Command blocked.", "error");
        }
        return { block: true, reason: "User denied dangerous command" };
      case "permanent-allow-failed": {
        const message = outcome.error.message;
        context.ui.notify(`Could not save the allow rule. Command remains blocked. ${message}`, "error");
        return { block: true, reason: "Could not save the permanent allow rule" };
      }
    }
  });
}
