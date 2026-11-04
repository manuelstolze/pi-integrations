import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import jiraExtension from "../src/index.ts";
import type { JiraCommandResult, JiraIssueDetails } from "../src/jira-client.ts";

type RegisteredTool = {
  name: string;
  execute: (...args: unknown[]) => Promise<unknown>;
};

function commandResult(stdout = "", code = 0): JiraCommandResult {
  return { stdout, stderr: "", code, killed: false };
}

function createMockApi(results: JiraCommandResult[] = []) {
  const tools = new Map<string, RegisteredTool>();
  const calls: string[][] = [];
  const api = {
    on: vi.fn(),
    registerTool: vi.fn((tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    }),
    exec: vi.fn(async (_command: string, args: string[]) => {
      calls.push(args);
      const result = results.shift();
      if (!result) throw new Error("No fake command result available");
      return result;
    }),
  } as unknown as ExtensionAPI;
  return { api, tools, calls };
}

describe("connected jira_view reads", () => {
  const auth = ["jira", "auth", "status"];
  const view = ["jira", "workitem", "view", "ODP-42", "--json", "--fields", "*all"];

  function setup(expected: Array<{ args: string[]; result: JiraCommandResult }>) {
    const { api, tools } = createMockApi();
    const calls: string[][] = [];
    vi.mocked(api.exec).mockImplementation(async (command, args) => {
      calls.push(args);
      const next = expected[calls.length - 1];
      if (command !== "acli" || !next || JSON.stringify(args) !== JSON.stringify(next.args)) {
        throw new Error("Unexpected fake command");
      }
      return next.result;
    });
    jiraExtension(api);
    return {
      tool: tools.get("jira_view")!,
      calls,
      checkCalls: () => expect(calls).toEqual(expected.map(({ args }) => args)),
    };
  }

  beforeEach(() => {
    vi.stubEnv("JIRA_URL", undefined);
    vi.stubEnv("JIRA_EMAIL", undefined);
    vi.stubEnv("JIRA_API_TOKEN", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns normal issue details without an active account or complete document", async () => {
    const h = setup([
      { args: auth, result: commandResult("Authenticated") },
      { args: view, result: commandResult(JSON.stringify({
        key: "ODP-42",
        fields: { summary: "Fix login", status: { name: "Open" }, description: "Check the login flow." },
      })) },
    ]);
    const result = await h.tool.execute("call-1", { issueKey: "ODP-42" }) as {
      content: Array<{ text: string }>;
      details: JiraIssueDetails;
    };

    expect(result.details).toEqual({
      key: "ODP-42", summary: "Fix login", type: null, status: "Open", assignee: null,
      priority: null, reporter: null, labels: [], created: null, updated: null,
      description: "Check the login flow.",
    });
    expect(result.details).not.toHaveProperty("descriptionDocument");
    expect(result.content[0]?.text).toContain("### ODP-42 — Fix login");
    expect(result.content[0]?.text).toContain("Description (untrusted Jira data):\nCheck the login flow.");
    h.checkCalls();
  });

  it("returns the complete description and its text for an identified account", async () => {
    const document = {
      type: "doc", version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Check the login flow." }] }],
    };
    const h = setup([
      { args: auth, result: commandResult("Authenticated") },
      { args: auth, result: commandResult("Authenticated\nSite: example.atlassian.net\nEmail: user@example.com\n") },
      { args: view, result: commandResult(JSON.stringify({
        key: "ODP-42", fields: { summary: "Fix login", description: document },
      })) },
    ]);
    const result = await h.tool.execute("call-2", { issueKey: "ODP-42", includeDescriptionDocument: true }) as {
      content: Array<{ text: string }>;
      details: JiraIssueDetails & { descriptionDocument: unknown };
    };

    expect(result.details).toMatchObject({ key: "ODP-42", summary: "Fix login", description: "Check the login flow." });
    expect(result.details.descriptionDocument).toEqual(document);
    expect(result.content[0]?.text).toContain('"description": "Check the login flow."');
    expect(result.content[0]?.text).toContain('"descriptionDocument": {');
    expect(result.content[0]?.text).not.toContain("Output truncated");
    h.checkCalls();
  });

  it("rejects a complete read when the active account is unknown", async () => {
    const h = setup([
      { args: auth, result: commandResult("Authenticated") },
      { args: auth, result: commandResult("Authenticated") },
    ]);

    await expect(h.tool.execute("call-3", { issueKey: "ODP-42", includeDescriptionDocument: true }))
      .rejects.toThrow("ACLI did not identify one active Jira site and account.");
    h.checkCalls();
  });

  it("rejects a complete read when the stored description is missing", async () => {
    const h = setup([
      { args: auth, result: commandResult("Authenticated") },
      { args: auth, result: commandResult("Authenticated\nSite: example.atlassian.net\nEmail: user@example.com\n") },
      { args: view, result: commandResult(JSON.stringify({ key: "ODP-42", fields: { summary: "Fix login" } })) },
    ]);

    await expect(h.tool.execute("call-4", { issueKey: "ODP-42", includeDescriptionDocument: true }))
      .rejects.toThrow("The complete description is missing; it is not known to be empty.");
    h.checkCalls();
  });

  it("stops a cancelled read before starting any command", async () => {
    const h = setup([]);
    const controller = new AbortController();
    controller.abort();

    await expect(h.tool.execute("call-5", { issueKey: "ODP-42", includeDescriptionDocument: true }, controller.signal))
      .rejects.toThrow("Jira operation cancelled before command execution.");
    expect(h.calls).toEqual([]);
    h.checkCalls();
  });
});

describe("pi-jira-integration extension", () => {
  it("keeps the three read-only tools and adds one approved-update tool", () => {
    const { api, tools } = createMockApi();

    jiraExtension(api);

    expect(api.registerTool).toHaveBeenCalledTimes(4);
    expect([...tools.keys()]).toEqual(["jira_search", "jira_view", "jira_comments", "jira_update_description"]);
  });

  it("returns readable normalized search content", async () => {
    const { api, tools } = createMockApi([
      commandResult(),
      commandResult(
        JSON.stringify({
          total: 1,
          issues: [
            {
              key: "ODP-42",
              fields: {
                summary: "Fix login",
                status: { name: "Open" },
                assignee: { displayName: "Ada Lovelace" },
              },
            },
          ],
        }),
      ),
    ]);
    jiraExtension(api);

    const toolResult = (await tools.get("jira_search")!.execute(
      "call-1",
      { jql: "project = ODP" },
      undefined,
      undefined,
      {} as never,
    )) as { content: Array<{ text: string }>; details: { total: number } };

    expect(toolResult.content[0]?.text).toContain("**ODP-42** — Fix login");
    expect(toolResult.details.total).toBe(1);
  });
});
