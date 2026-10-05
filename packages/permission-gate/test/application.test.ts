import { describe, expect, it, vi } from "vitest";
import { createPermissionGate } from "../src/application/use-cases/permission-gate.ts";
import type {
  PermissionConfigLoadResult,
  PermissionConfigPort,
} from "../src/application/ports/permission-config-port.ts";
import type { PermissionApprovalPort, PermissionApprovalResult } from "../src/application/ports/permission-approval-port.ts";
import type { SessionApprovalsPort } from "../src/application/ports/session-approvals-port.ts";

class FakeConfig implements PermissionConfigPort {
  savedCommands: string[] = [];
  saveError: Error | undefined;
  loadResult: PermissionConfigLoadResult = { configuration: {} };

  load(): PermissionConfigLoadResult {
    return this.loadResult;
  }

  saveExactAllowRule(command: string) {
    if (this.saveError) throw this.saveError;
    this.savedCommands.push(command);
    return { pattern: `^${command}$`, regex: true };
  }
}

class FakeSessionApprovals implements SessionApprovalsPort {
  private readonly commands = new Set<string>();

  clear(): void {
    this.commands.clear();
  }

  has(command: string): boolean {
    return this.commands.has(command);
  }

  allow(command: string): void {
    this.commands.add(command);
  }
}

function createGate(config = new FakeConfig(), session = new FakeSessionApprovals()) {
  const gate = createPermissionGate(config, session);
  gate.startSession();
  return { gate, config, session };
}

function approval(result: PermissionApprovalResult): PermissionApprovalPort {
  return { request: vi.fn(async () => result) };
}

describe("permission gate application", () => {
  it("blocks auto-deny commands before checking configured allow rules", async () => {
    const config = new FakeConfig();
    config.loadResult = {
      configuration: { allowedPatterns: [{ pattern: "az group delete" }] },
    };
    const { gate } = createGate(config);
    const prompt = approval({ kind: "allow-once" });

    const outcome = await gate.handleCommand("az group delete --name demo", prompt);

    expect(outcome).toMatchObject({ kind: "auto-deny", pattern: "az group delete" });
    expect(prompt.request).not.toHaveBeenCalled();
  });

  it("blocks dangerous commands when approval is unavailable", async () => {
    const { gate } = createGate();

    await expect(gate.handleCommand("sudo reboot", approval({ kind: "unavailable" }))).resolves.toEqual({
      kind: "approval-unavailable",
      description: "superuser command",
    });
  });

  it("allows a dangerous command once", async () => {
    const { gate } = createGate();

    await expect(gate.handleCommand("sudo reboot", approval({ kind: "allow-once" }))).resolves.toEqual({
      kind: "allow",
    });
  });

  it("allows the exact command for the rest of the session", async () => {
    const { gate, session } = createGate();

    await gate.handleCommand("sudo reboot", approval({ kind: "allow-session" }));

    expect(session.has("sudo reboot")).toBe(true);
    await expect(gate.handleCommand("sudo reboot", approval({ kind: "allow-once" }))).resolves.toEqual({
      kind: "allow",
    });
    await expect(gate.handleCommand("sudo shutdown", approval({ kind: "unavailable" }))).resolves.toMatchObject({
      kind: "approval-unavailable",
    });

    gate.startSession();
    expect(session.has("sudo reboot")).toBe(false);
  });

  it("saves a permanent exact-command rule and allows the command again", async () => {
    const { gate, config } = createGate();
    const command = "sudo reboot";

    await expect(gate.handleCommand(command, approval({ kind: "allow-forever" }))).resolves.toEqual({
      kind: "allow-forever",
      command,
    });
    expect(config.savedCommands).toEqual([command]);

    await expect(gate.handleCommand(command, approval({ kind: "unavailable" }))).resolves.toEqual({ kind: "allow" });
  });

  it("blocks the command if saving a permanent rule fails", async () => {
    const config = new FakeConfig();
    config.saveError = new Error("invalid config");
    const { gate } = createGate(config);

    await expect(gate.handleCommand("sudo reboot", approval({ kind: "allow-forever" }))).resolves.toMatchObject({
      kind: "permanent-allow-failed",
      error: { message: "invalid config" },
    });
  });

  it("returns a denial instruction after trimming it", async () => {
    const { gate } = createGate();

    await expect(
      gate.handleCommand("sudo reboot", approval({ kind: "deny", instruction: "  Use a safer command.  " })),
    ).resolves.toEqual({ kind: "user-deny", instruction: "Use a safer command." });
  });

  it("uses built-in dangerous patterns after config errors", async () => {
    const config = new FakeConfig();
    config.loadResult = { configuration: {}, error: new Error("bad config") };
    const gate = createPermissionGate(config, new FakeSessionApprovals());

    expect(gate.startSession()?.message).toBe("bad config");
    await expect(gate.handleCommand("sudo reboot", approval({ kind: "unavailable" }))).resolves.toMatchObject({
      kind: "approval-unavailable",
    });
  });

  it("can disable built-in patterns", async () => {
    const config = new FakeConfig();
    config.loadResult = { configuration: { applyBuiltinDefaults: false } };
    const { gate } = createGate(config);

    await expect(gate.handleCommand("sudo reboot", approval({ kind: "unavailable" }))).resolves.toEqual({
      kind: "allow",
    });
  });
});
