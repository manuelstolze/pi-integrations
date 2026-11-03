import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JiraCliAdapter } from "../src/infrastructure/jira-cli-adapter.js";
import { doc, snapshot } from "./description-fixtures.js";
import type { JiraCommandResult } from "../src/infrastructure/cli-types.js";

const result = (stdout = "", code = 0, stderr = ""): JiraCommandResult => ({ stdout, code, stderr, killed: false });
const status = "✓ Authenticated\n  Site: example.atlassian.net\n  Email: user@example.com\n";
function setup(description: unknown = doc("Original"), extra: Record<string, unknown> = {}) {
  const login = vi.fn();
  const run = vi.fn(async (args: string[]) => args[1] === "auth" ? result(status) : result(JSON.stringify({ key: "D3X-123", fields: { description, ...extra } })));
  return { client: new JiraCliAdapter({ runCommand: run, login, env: {} }), run, login };
}

describe("description CLI", () => {
  it("returns raw and normalized content from one response without shortening the document", async () => {
    const value = doc("x".repeat(25_000)); const h = setup(value);
    const r = await h.client.readDescription("D3X-123", undefined, true);
    expect(r.descriptionDocument).toEqual(value);
    expect(r.issue.description).toContain("[Text truncated]");
    expect(h.run.mock.calls.filter(([args]) => args.includes("view"))).toHaveLength(1);
    expect(r.target).toEqual(snapshot().target);
  });
  it.each([null, "legacy description"])("keeps a known stored value: %j", async (value) => {
    expect((await setup(value).client.readDescription("D3X-123")).descriptionDocument).toBe(value);
  });
  it("rejects omitted or unreadable descriptions", async () => {
    const h = setup();
    h.run.mockImplementation(async (args) => args[1] === "auth" ? result(status) : result(JSON.stringify({ key: "D3X-123", fields: {} })));
    await expect(h.client.readDescription("D3X-123")).rejects.toThrow("missing");
    await expect(setup({ arbitrary: "unknown" }).client.readDescription("D3X-123")).rejects.toThrow("unreadable");
  });
  it("writes a private two-key payload once and removes the file", async () => {
    const h = setup(); let file = "";
    h.run.mockImplementation(async (args) => {
      if (!args.includes("edit")) return result(status);
      expect(args.slice(0, 4)).toEqual(["jira", "workitem", "edit", "--from-json"]);
      expect(args.slice(5)).toEqual(["--yes", "--json"]);
      file = args[4]!;
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ issues: ["D3X-123"], description: doc() });
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect((await stat(dirname(file))).mode & 0o777).toBe(0o700);
      return result("{}");
    });
    const proposal = { id: "id", sessionId: "s", snapshot: snapshot(), description: doc() };
    expect(await h.client.replaceDescription(proposal)).toEqual({ writeAttempted: true });
    await expect(stat(file)).rejects.toThrow();
    expect(h.run.mock.calls.filter(([args]) => args.includes("edit"))).toHaveLength(1);
    expect(h.login).not.toHaveBeenCalled();
  });
  it("redacts a failed write and removes its file without retry", async () => {
    let file = "";
    const run = vi.fn(async (args: string[]) => {
      if (args[1] === "auth") return result(status);
      file = args[4]!; return result("", 1, "Permission denied secret-token");
    });
    const client = new JiraCliAdapter({ runCommand: run, login: vi.fn(), env: { JIRA_API_TOKEN: "secret-token" } });
    const r = await client.replaceDescription({ id: "id", sessionId: "s", snapshot: snapshot(), description: doc() });
    expect(r.error).toContain("[redacted]"); expect(r.error).not.toContain("secret-token");
    await expect(stat(file)).rejects.toThrow();
    expect(run.mock.calls.filter(([args]) => args.includes("edit"))).toHaveLength(1);
  });
  it("blocks account switches or ambiguous identity without login", async () => {
    for (const text of [status.replace("user@example.com", "other@example.com"), "Authenticated", status + "Site: other.atlassian.net\n"]) {
      const h = setup(); h.run.mockResolvedValue(result(text));
      expect(await h.client.replaceDescription({ id: "id", sessionId: "s", snapshot: snapshot(), description: doc() })).toMatchObject({ writeAttempted: false, error: expect.any(String) });
      expect(h.run.mock.calls.some(([args]) => args.includes("edit"))).toBe(false);
      expect(h.login).not.toHaveBeenCalled();
    }
  });
  it("reads status from either output stream and strips styling", async () => {
    const h = setup(); h.run.mockImplementation(async (args) => args[1] === "auth" ? result("", 0, `\u001b[32m${status}\u001b[0m`) : result(JSON.stringify({ key: "D3X-123", fields: { description: null } })));
    expect((await h.client.readDescription("D3X-123")).target).toEqual(snapshot().target);
  });
  it("rejects aborted operations before any command", async () => {
    const h = setup(); const controller = new AbortController(); controller.abort();
    await expect(h.client.readDescription("D3X-123", controller.signal)).rejects.toThrow("cancelled");
    expect(h.run).not.toHaveBeenCalled();
  });
});
