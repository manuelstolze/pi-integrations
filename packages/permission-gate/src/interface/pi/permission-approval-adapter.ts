import type { PermissionApprovalPort, PermissionApprovalResult } from "../../application/ports/permission-approval-port.js";
import { createDialog, type ConfirmResult } from "./dialog.js";

interface PiApprovalContext {
  hasUI: boolean;
  custom(dialog: ReturnType<typeof createDialog>): Promise<ConfirmResult | undefined>;
  select(title: string, choices: string[]): Promise<string | undefined>;
  input(prompt: string, defaultValue?: string): Promise<string | undefined>;
}

export class PiPermissionApprovalAdapter implements PermissionApprovalPort {
  constructor(
    private readonly context: PiApprovalContext,
    private readonly reportActive: (description: string) => void,
    private readonly reportInactive: () => void,
  ) {}

  async request(command: string, description: string): Promise<PermissionApprovalResult> {
    if (!this.context.hasUI) return { kind: "unavailable" };

    this.reportActive(description);
    try {
      let result = await this.context.custom(createDialog(command, description));

      // RPC and headless UI contexts can return undefined for custom dialogs.
      if (result === undefined) {
        const selection = await this.context.select(`Dangerous command: ${description}`, [
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

      if (result === "allow-once") return { kind: "allow-once" };
      if (result === "allow-session") return { kind: "allow-session" };
      if (result === "allow-forever") return { kind: "allow-forever" };

      return { kind: "deny", instruction: await this.context.input("Tell pi what to do instead:", "") };
    } finally {
      this.reportInactive();
    }
  }
}
