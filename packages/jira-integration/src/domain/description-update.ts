import type { JiraIssueDetails } from "./types.js";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type AdfDocument = { type: "doc"; version: 1; content: Json[] };
export type StoredDescription = AdfDocument | string | null;
export interface JiraTarget { site: string; account: string }
export interface DescriptionSnapshot {
  target: JiraTarget;
  issue: JiraIssueDetails;
  descriptionDocument: StoredDescription;
}
export interface DescriptionProposal {
  id: string;
  sessionId: string;
  snapshot: Pick<DescriptionSnapshot, "target" | "descriptionDocument"> & { issue: { key: string } };
  description: AdfDocument;
}
export interface Submission { writeAttempted?: boolean; error?: string; cleanupError?: string }
export interface UpdateResult {
  status: "pending-approval" | "approval-required" | "cancelled-before-write" | "conflict" | "rejected" | "verified" | "unchanged" | "different" | "unknown";
  writeAttempted: boolean;
  proposalId?: string;
  issueKey?: string;
  site?: string;
  error?: string;
  cleanupError?: string;
  recordError?: string;
  proposal?: DescriptionProposal;
}
export type UpdateInput =
  | { action: "prepare"; issueKey: string; description: unknown }
  | { action: "apply"; proposalId: string };

export function issueKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(value)) {
    throw new Error("Use exactly one issue key, such as D3X-123.");
  }
  return value;
}

export function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equalJson(v, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]));
}

export function validateUpdateInput(input: unknown): asserts input is UpdateInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid update request.");
  const r = input as Record<string, unknown>;
  const keys = r.action === "prepare" ? ["action", "issueKey", "description"] : ["action", "proposalId"];
  if (Object.keys(r).length !== keys.length || keys.some((key) => !Object.hasOwn(r, key))) throw new Error("Unexpected or missing update fields.");
  if (r.action === "prepare") issueKey(r.issueKey);
  else if (r.action !== "apply" || typeof r.proposalId !== "string" || !r.proposalId.trim()) throw new Error("Invalid proposal ID or action.");
}
