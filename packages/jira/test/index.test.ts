import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import jiraExtension from "../src/index.ts";
import type { JiraCommandResult } from "../src/jira-client.ts";

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

describe("pi-jira-integration extension", () => {
  it("registers the three read-only Jira tools", () => {
    const { api, tools } = createMockApi();

    jiraExtension(api);

    expect(api.registerTool).toHaveBeenCalledTimes(3);
    expect([...tools.keys()]).toEqual(["jira_search", "jira_view", "jira_comments"]);
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
