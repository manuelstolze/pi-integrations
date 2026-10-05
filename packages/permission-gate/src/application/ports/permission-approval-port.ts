export type PermissionApprovalResult =
  | { kind: "allow-once" }
  | { kind: "allow-session" }
  | { kind: "allow-forever" }
  | { kind: "deny"; instruction?: string }
  | { kind: "unavailable" };

export interface PermissionApprovalPort {
  request(command: string, description: string): Promise<PermissionApprovalResult>;
}
