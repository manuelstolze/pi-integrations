import type { SessionApprovalsPort } from "../../application/ports/session-approvals-port.js";

export class InMemorySessionApprovals implements SessionApprovalsPort {
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
