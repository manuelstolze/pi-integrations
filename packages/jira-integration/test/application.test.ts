import { describe, expect, it, vi } from "vitest";
import { JiraToolError } from "../src/application/errors.js";
import { createJiraUseCases } from "../src/application/use-cases/jira-tools.js";
import type { JiraReadPort } from "../src/application/ports/jira-read-port.js";

describe("Jira application use cases", () => {
  it("validates and forwards normalized search requests", async () => {
    const port: JiraReadPort = {
      search: vi.fn(async () => ({ total: 0, issues: [] })),
      view: vi.fn(),
      comments: vi.fn(),
    };
    const useCases = createJiraUseCases(port);

    await expect(useCases.search(" project = ODP ")).resolves.toEqual({ total: 0, issues: [] });
    expect(port.search).toHaveBeenCalledWith("project = ODP", 10, undefined);
    await expect(useCases.search(" ")).rejects.toMatchObject({
      name: "JiraToolError",
      code: "invalid-input",
    });
    expect(port.search).toHaveBeenCalledTimes(1);
  });

  it("validates view and comments inputs and forwards abort signals", async () => {
    const controller = new AbortController();
    const port: JiraReadPort = {
      search: vi.fn(),
      view: vi.fn(async () => ({
        key: "ODP-42", summary: null, type: null, status: null, assignee: null, priority: null,
        reporter: null, labels: [], created: null, updated: null, description: null,
      })),
      comments: vi.fn(async () => ({ issueKey: "ODP-42", comments: [] })),
    };
    const useCases = createJiraUseCases(port);

    await useCases.view(" ODP-42 ", controller.signal);
    await useCases.comments("ODP-42", 20, controller.signal);
    expect(port.view).toHaveBeenCalledWith("ODP-42", controller.signal);
    expect(port.comments).toHaveBeenCalledWith("ODP-42", 20, controller.signal);
    await expect(useCases.comments("ODP-42", 21)).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("keeps errors from the port intact", async () => {
    const failure = new JiraToolError("timeout", "Jira timed out.");
    const port: JiraReadPort = {
      search: vi.fn(async () => { throw failure; }),
      view: vi.fn(),
      comments: vi.fn(),
    };
    const useCases = createJiraUseCases(port);

    await expect(useCases.search("project = ODP")).rejects.toBe(failure);
  });
});
