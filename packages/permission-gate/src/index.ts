import { isToolCallEventType, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createDialog, type ConfirmResult } from "./dialog.js";
import {
  BUILTIN_PATTERNS,
  findPattern,
  readConfig,
  testPattern,
  writeExactAllowRule,
  type PatternConfig,
} from "./config.js";
import { findAutoDenyMatch } from "./rules.js";

const permissionGate: ExtensionFactory = (pi) => {
  const sessionAllowedCommands = new Set<string>();
  let allowedPatterns: PatternConfig[] = [];
  let dangerPatterns: PatternConfig[] = [];
  let configError: Error | undefined;

  function reportPermissionGate(active: boolean, label?: string): void {
    if (process.env.HERDR_ENV !== "1") return;
    pi.events.emit("herdr:blocked", { active, label });
  }

  function loadConfig(): void {
    sessionAllowedCommands.clear();
    const result = readConfig();
    configError = result.error;
    const config = result.error ? {} : result.config;
    const applyDefaults = config.applyBuiltinDefaults !== false;
    const customPatterns = config.permissionGate?.patterns ?? [];

    dangerPatterns = applyDefaults ? [...customPatterns, ...BUILTIN_PATTERNS] : customPatterns;
    allowedPatterns = config.permissionGate?.allowedPatterns ?? [];
  }

  pi.on("session_start", (_event, ctx) => {
    loadConfig();
    if (configError) {
      ctx.ui.notify(
        `Could not read guardrails.json. Using built-in dangerous-command patterns. ${configError.message}`,
        "warning",
      );
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;

    // Auto-deny checks must run first. Config allow rules cannot override them.
    const autoDeny = findAutoDenyMatch(command);
    if (autoDeny) {
      ctx.ui.notify(`Auto-blocked: ${autoDeny.pattern} — ${autoDeny.reason}`, "error");
      return { block: true, reason: `Catastrophic command auto-blocked: ${autoDeny.reason}` };
    }

    if (sessionAllowedCommands.has(command)) return;
    if (allowedPatterns.some((pattern) => testPattern(pattern, command))) return;

    const match = findPattern(command, dangerPatterns);
    if (!match) return;

    const description = match.description ?? match.pattern;
    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Dangerous command blocked (no UI to confirm): ${description}`,
      };
    }

    reportPermissionGate(true, `Permission gate: ${description}`);
    try {
      let result = await ctx.ui.custom<ConfirmResult>(createDialog(command, description));

      // RPC and headless UI contexts can return undefined for custom dialogs.
      if (result === undefined) {
        const selection = await ctx.ui.select(`Dangerous command: ${description}`, [
          "1 - Allow once",
          "2 - Allow this session",
          "3 - Allow forever",
          "4 - Deny (tell pi what to do instead)",
        ]);
        if (selection?.startsWith("1")) result = "allow-once";
        else if (selection?.startsWith("2")) result = "allow-session";
        else if (selection?.startsWith("3")) result = "allow-forever";
        else result = "deny";
      }

      if (result === "allow-once") return;
      if (result === "allow-session") {
        sessionAllowedCommands.add(command);
        return;
      }
      if (result === "allow-forever") {
        try {
          const rule = writeExactAllowRule(command);
          if (!allowedPatterns.some((item) => item.pattern === rule.pattern && item.regex === true)) {
            allowedPatterns.push(rule);
          }
          ctx.ui.notify(
            `Added an exact command to the global allowlist: ${command.slice(0, 60)}${command.length > 60 ? "…" : ""}`,
            "info",
          );
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Could not save the allow rule. Command remains blocked. ${message}`, "error");
          return { block: true, reason: "Could not save the permanent allow rule" };
        }
      }

      const instruction = await ctx.ui.input("Tell pi what to do instead:", "");
      if (instruction?.trim()) {
        pi.sendUserMessage(
          `The command \`${command}\` was blocked. Please do the following instead: ${instruction.trim()}`,
          { deliverAs: "steer" },
        );
      } else {
        ctx.ui.notify("Command blocked.", "error");
      }
      return { block: true, reason: "User denied dangerous command" };
    } finally {
      reportPermissionGate(false);
    }
  });
};

export default permissionGate;
