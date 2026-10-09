export interface SessionApprovalsPort {
  clear(): void;
  has(command: string): boolean;
  allow(command: string): void;
}
