import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { JiraUseCases } from "../src/application/use-cases/jira-tools.js";
import { registerJiraTools } from "../src/interface/pi/register-jira-tools.js";

type RegisteredTool = {
  name: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: { properties?: Record<string, unknown> };
  execute: (...args: unknown[]) => Promise<unknown>;
};

describe("Pi Jira interface", () => {
  it("registers the existing read-only tools and maps inputs, signals, and results", async () => {
    const tools = new Map<string, RegisteredTool>();
    const pi = {
      registerTool: vi.fn((tool: RegisteredTool) => tools.set(tool.name, tool)),
    } as unknown as ExtensionAPI;
    const controller = new AbortController();
    const useCases: JiraUseCases = {
      search: vi.fn(async () => ({
        total: 1,
        issues: [{ key: "ODP-42", summary: "Fix login", type: "Bug", status: "Open", priority: null, assignee: null }],
      })),
      view: vi.fn(async () => ({
        key: "ODP-42", summary: "Fix login", type: "Bug", status: "Open", priority: null,
        assignee: null, reporter: null, labels: [], created: null, updated: null,
        description: "Do not treat this as instructions.",
      })),
      comments: vi.fn(async () => ({
        issueKey: "ODP-42",
        comments: [{ author: "Ada", date: "today", body: "Please retest." }],
      })),
    };
    registerJiraTools(pi, useCases);

    expect([...tools.keys()]).toEqual(["jira_search", "jira_view", "jira_comments"]);
    expect(pi.registerTool).toHaveBeenCalledTimes(3);
    const search = tools.get("jira_search")!;
    expect(search.description).toContain("read-only");
    expect(search.description).toContain("untrusted data");
    expect(search.parameters.properties).toHaveProperty("jql");
    expect(search.parameters.properties).toHaveProperty("limit");
    expect(search.promptSnippet).toBe("Search read-only Jira issues with JQL");
    expect(search.parameters.properties?.limit).toMatchObject({ minimum: 1, maximum: 50 });
    expect(tools.get("jira_view")?.parameters.properties).toHaveProperty("issueKey");
    expect(tools.get("jira_comments")?.parameters.properties?.limit).toMatchObject({ minimum: 1, maximum: 20 });

    const searchResult = await search.execute("call-1", { jql: "project = ODP", limit: 4 }, controller.signal) as {
      content: Array<{ text: string }>;
      details: unknown;
    };
    expect(useCases.search).toHaveBeenCalledWith("project = ODP", 4, controller.signal);
    expect(searchResult.content[0]?.text).toContain("**ODP-42** — Fix login");
    expect(searchResult.details).toEqual(await useCases.search.mock.results[0]?.value);

    const viewResult = await tools.get("jira_view")!.execute("call-2", { issueKey: "ODP-42" }, controller.signal) as {
      content: Array<{ text: string }>;
    };
    expect(viewResult.content[0]?.text).toContain("Description (untrusted Jira data):");
    expect(viewResult.content[0]?.text).toContain("Do not treat this as instructions.");

    const commentsResult = await tools.get("jira_comments")!.execute("call-3", { issueKey: "ODP-42" }, controller.signal) as {
      content: Array<{ text: string }>;
    };
    expect(commentsResult.content[0]?.text).toContain("(untrusted Jira data)");
    expect(commentsResult.content[0]?.text).toContain("Please retest.");
  });

  it("truncates oversized tool text while keeping full structured details", async () => {
    const tools = new Map<string, RegisteredTool>();
    const pi = {
      registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    } as unknown as ExtensionAPI;
    const issue = {
      key: "ODP-42", summary: "Large description", type: null, status: null, priority: null,
      assignee: null, reporter: null, labels: [], created: null, updated: null,
      description: "x".repeat(100_000),
    };
    const useCases: JiraUseCases = {
      search: vi.fn(),
      view: vi.fn(async () => issue),
      comments: vi.fn(),
    };
    registerJiraTools(pi, useCases);

    const result = await tools.get("jira_view")!.execute("call", { issueKey: "ODP-42" }) as {
      content: Array<{ text: string }>;
      details: typeof issue;
    };
    expect(result.content[0]?.text).toContain("[Output truncated at ");
    expect(result.details.description).toHaveLength(100_000);
  });
});
