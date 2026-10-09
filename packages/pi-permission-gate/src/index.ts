import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createPermissionGate } from "./application/use-cases/permission-gate.js";
import { FilePermissionConfigAdapter } from "./infrastructure/config/file-permission-config-adapter.js";
import { registerPermissionGate } from "./interface/pi/extension.js";
import { InMemorySessionApprovals } from "./interface/pi/session-approvals.js";

const permissionGate: ExtensionFactory = (pi) => {
  const gate = createPermissionGate(
    new FilePermissionConfigAdapter(),
    new InMemorySessionApprovals(),
  );
  registerPermissionGate(pi, gate);
};

export default permissionGate;
