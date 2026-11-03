import { readFile, stat } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerJiraTools } from "../src/interface/pi/register-jira-tools.js";
import { registerDescriptionUpdateTool } from "../src/interface/pi/register-description-update-tool.js";
import { createCompleteOutput } from "../src/interface/pi/complete-output.js";
import { DescriptionFiles } from "../src/infrastructure/description-files.js";
import { createDescriptionUpdates } from "../src/application/use-cases/update-description.js";
import { doc, harness, snapshot } from "./description-fixtures.js";

type Tool = { name: string; parameters: Record<string, unknown>; execute: (...args: any[]) => Promise<any> };
const api = () => {
  const tools = new Map<string, Tool>();
  return { tools, pi: { registerTool: (tool: Tool) => tools.set(tool.name, tool) } as unknown as ExtensionAPI };
};

it("keeps default view output and adds complete stored content only on request (AC-015)", async () => {
  const { pi, tools } = api();
  const original = snapshot().issue;
  const complete = { ...original, descriptionDocument: doc("x".repeat(30_000)) };
  const view = vi.fn(async () => original);
  const viewDocument = vi.fn(async () => complete);
  registerJiraTools(pi, { search: vi.fn(), comments: vi.fn(), view, viewDocument }, async (value) => JSON.stringify(value));
  expect([...tools.keys()]).toEqual(["jira_search", "jira_view", "jira_comments"]);
  const tool = tools.get("jira_view")!;
  const normal = await tool.execute("id", { issueKey: "D3X-123" });
  expect(normal.details).toEqual(original);
  expect(normal.details).not.toHaveProperty("descriptionDocument");
  expect(view).toHaveBeenCalledTimes(1); expect(viewDocument).not.toHaveBeenCalled();
  const full = await tool.execute("id", { issueKey: "D3X-123", includeDescriptionDocument: true });
  expect(full.details.descriptionDocument).toEqual(complete.descriptionDocument);
  expect(full.details.description).toBe(original.description);
  expect(view).toHaveBeenCalledTimes(1); expect(viewDocument).toHaveBeenCalledTimes(1);
});

it("stores complete oversized output privately without truncating saved values (AC-006)", async () => {
  const files = new DescriptionFiles(); const output = createCompleteOutput((value) => files.output(value));
  const value = { descriptionDocument: doc("x".repeat(100_000)) };
  const text = await output(value);
  const path = /Complete JSON: ([^\]]+)/.exec(text)![1]!;
  expect(text).toContain("Output truncated");
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(value);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  await files.cleanup(); await expect(stat(path)).rejects.toThrow();
});

it("recreates a complete pending preview after its temporary file was removed", async () => {
  const h = harness(); const first = new DescriptionFiles();
  const proposal = h.conversation.create(snapshot(), doc("x".repeat(100_000)));
  h.publish(proposal);
  const oldPath = await first.output(proposal);
  await first.cleanup();
  await expect(stat(oldPath)).rejects.toThrow();
  const resumed = harness(h.manager);
  const jira = { readDescription: vi.fn(), replaceDescription: vi.fn() };
  const result = await createDescriptionUpdates(jira, resumed.conversation).execute({ action: "apply", proposalId: proposal.id });
  expect(result).toMatchObject({ status: "approval-required", writeAttempted: false, proposal });
  const next = new DescriptionFiles();
  const output = await createCompleteOutput((value) => next.output(value))(result);
  const path = /Complete JSON: ([^\]]+)/.exec(output)![1]!;
  expect(JSON.parse(await readFile(path, "utf8")).proposal).toEqual(proposal);
  expect(jira.replaceDescription).not.toHaveBeenCalled();
  await next.cleanup();
});

it("adds one strict prepare/apply tool with conversation approval and no UI", async () => {
  const { pi, tools } = api(); const h = harness(); let saved = snapshot();
  const jira = { readDescription: vi.fn(async () => structuredClone(saved)), replaceDescription: vi.fn(async (p) => { saved.descriptionDocument = p.description; return {}; }) };
  registerDescriptionUpdateTool(pi, createDescriptionUpdates(jira, h.conversation), h.conversation, async (value) => JSON.stringify(value));
  expect([...tools.keys()]).toEqual(["jira_update_description"]);
  const tool = tools.get("jira_update_description")!;
  expect(tool.parameters).toHaveProperty("anyOf");
  const prepared = await tool.execute("prepare", { action: "prepare", issueKey: "D3X-123", description: doc() }, undefined, undefined, { ...h.context, mode: "print", hasUI: false });
  expect(prepared.details.status).toBe("pending-approval");
  expect(prepared.content[0].text).toContain(`Approve Jira update ${prepared.details.proposalId}`);
  expect(jira.replaceDescription).not.toHaveBeenCalled();
  h.publish(prepared.details.proposal);
  expect((await tool.execute("id", { action: "apply", proposalId: prepared.details.proposalId }, undefined, undefined, h.context)).details.status).toBe("approval-required");
  h.user(`Approve Jira update ${prepared.details.proposalId}`);
  expect((await tool.execute("id", { action: "apply", proposalId: prepared.details.proposalId }, undefined, undefined, h.context)).details.status).toBe("verified");
  await expect(tool.execute("id", { action: "apply", proposalId: "id", approved: true }, undefined, undefined, h.context)).rejects.toThrow();
});
