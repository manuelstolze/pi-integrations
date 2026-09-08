import { describe, expect, it, vi } from "vitest";
import {
  JiraClient,
  JiraToolError,
  type JiraCommandResult,
  normalizeIssueDetails,
  normalizeJiraText,
} from "../src/jira-client.ts";

function result(stdout = "", code = 0, stderr = ""): JiraCommandResult {
  return { stdout, stderr, code, killed: false };
}

function createClient(
  commandResults: JiraCommandResult[],
  options: {
    env?: NodeJS.ProcessEnv;
    loginResult?: JiraCommandResult;
  } = {},
) {
  const calls: string[][] = [];
  const login = vi.fn(async () => options.loginResult ?? result());
  const client = new JiraClient({
    env: options.env ?? {},
    runCommand: vi.fn(async (args) => {
      calls.push(args);
      const next = commandResults.shift();
      if (!next) throw new Error("No fake command result available");
      return next;
    }),
    login,
  });
  return { client, calls, login };
}

describe("JiraClient", () => {
  it("searches with unchanged JQL and normalized issue fields", async () => {
    const { client, calls } = createClient([
      result(),
      result(
        JSON.stringify({
          total: 2,
          issues: [
            {
              key: "ODP-42",
              fields: {
                summary: "Fix login",
                issuetype: { name: "Bug" },
                status: { name: "Open" },
                assignee: { displayName: "Ada Lovelace" },
                priority: { name: "High" },
              },
            },
          ],
        }),
      ),
    ]);

    const search = await client.search(' project = ODP AND status = "Open" ', 10);

    expect(search).toEqual({
      total: 2,
      issues: [
        {
          key: "ODP-42",
          summary: "Fix login",
          type: "Bug",
          status: "Open",
          assignee: "Ada Lovelace",
          priority: "High",
        },
      ],
    });
    expect(calls).toEqual([
      ["jira", "auth", "status"],
      [
        "jira",
        "workitem",
        "search",
        "--jql",
        'project = ODP AND status = "Open"',
        "--fields",
        "key,issuetype,summary,status,assignee,priority",
        "--limit",
        "10",
        "--json",
      ],
    ]);
  });

  it("normalizes ADF descriptions and missing scalar fields", () => {
    const issue = normalizeIssueDetails({
      key: "ODP-42",
      fields: {
        summary: "Fix login",
        issuetype: { name: "Bug" },
        status: { name: "Open" },
        priority: { name: "High" },
        assignee: null,
        reporter: { displayName: "Grace Hopper" },
        labels: ["auth", "api"],
        created: "2026-04-12T09:30:00.000+0000",
        updated: "2026-04-12T10:30:00.000+0000",
        description: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "First line" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Second line" }],
            },
          ],
        },
      },
    });

    expect(issue).toEqual({
      key: "ODP-42",
      summary: "Fix login",
      type: "Bug",
      status: "Open",
      assignee: null,
      priority: "High",
      reporter: "Grace Hopper",
      labels: ["auth", "api"],
      created: "2026-04-12T09:30:00.000+0000",
      updated: "2026-04-12T10:30:00.000+0000",
      description: "First line\nSecond line",
    });
  });

  it("lists comments with a bounded limit and normalized bodies", async () => {
    const { client, calls } = createClient([
      result(),
      result(
        JSON.stringify({
          comments: [
            {
              author: { displayName: "Grace Hopper" },
              created: "2026-04-12T10:30:00.000+0000",
              body: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Please retest this." }],
                  },
                ],
              },
            },
          ],
        }),
      ),
    ]);

    const comments = await client.comments(" ODP-42 ", 20);

    expect(comments).toEqual({
      issueKey: "ODP-42",
      comments: [
        {
          author: "Grace Hopper",
          date: "2026-04-12T10:30:00.000+0000",
          body: "Please retest this.",
        },
      ],
    });
    expect(calls[1]).toEqual([
      "jira",
      "workitem",
      "comment",
      "list",
      "--key",
      "ODP-42",
      "--json",
      "--limit",
      "20",
    ]);
  });

  it("auto-logs in from environment variables after an auth failure", async () => {
    const { client, login } = createClient([result("not logged in", 1), result(JSON.stringify({ issues: [] }))], {
      env: {
        JIRA_URL: "example.atlassian.net",
        JIRA_EMAIL: "ada@example.com",
        JIRA_API_TOKEN: "secret-token",
      },
    });

    await client.search("project = ODP");

    expect(login).toHaveBeenCalledWith(
      {
        site: "example.atlassian.net",
        email: "ada@example.com",
        token: "secret-token",
      },
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });

  it("does not expose a missing authentication token", async () => {
    const { client } = createClient([result("not logged in", 1)], {
      env: { JIRA_URL: "example.atlassian.net", JIRA_EMAIL: "ada@example.com" },
    });

    await expect(client.search("project = ODP")).rejects.toMatchObject({
      code: "authentication-required",
      message: expect.not.stringContaining("secret-token"),
    });
  });

  it("rejects invalid limits and empty inputs", async () => {
    const { client } = createClient([]);

    await expect(client.search("project = ODP", 51)).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(client.comments(" ")).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(client.view(" ")).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("reports malformed Jira JSON as a tool error", async () => {
    const { client } = createClient([result(), result("not json")]);

    const error = await client.search("project = ODP").catch((value: unknown) => value);

    expect(error).toBeInstanceOf(JiraToolError);
    expect(error).toMatchObject({ code: "invalid-json" });
  });

  it("formats unknown structured text without throwing", () => {
    expect(normalizeJiraText({ unexpected: "value" })).toBe(
      '[Structured Jira text] {"unexpected":"value"}',
    );
  });
});
