import { describe, expect, it, vi } from "vitest";
import heraldExtension from "../src/index.ts";
import { collectGitContext, isReadOnlyGitCommand, parseRemoteUrl } from "../src/git.ts";
import { detectKnownProvider, normalizeTargetRepository, requestHead } from "../src/remote.ts";
import { parseCommandArgs, validateCommitGroups } from "../src/workflow.ts";
import { createRequestArgs, listRequestArgs } from "../src/providers.ts";

const sourceRemote = {
  name: "origin",
  fetchUrl: "git@github.com:team/project.git",
  pushUrl: "git@github.com:team/project.git",
  host: "github.com",
  repository: "team/project",
};

const requestInput = {
  provider: "github" as const,
  host: "example.ghe.com",
  targetRepository: "team/project",
  sourceRepository: "user/project",
  sourceBranch: "feature/provider",
  targetBranch: "main",
  title: "Add provider",
  bodyFile: "/tmp/herald/request.md",
};

describe("extension loading", () => {
  it("does not call runtime actions while the extension factory runs", () => {
    const api = {
      appendEntry: vi.fn(),
      getActiveTools: vi.fn(() => ["read"]),
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      setActiveTools: vi.fn(() => {
        throw new Error("Extension runtime not initialized");
      }),
    };

    expect(() => heraldExtension(api as never)).not.toThrow();
    expect(api.setActiveTools).not.toHaveBeenCalled();
  });
});

describe("Git context", () => {
  it("keeps the first status path intact", async () => {
    const pi = {
      exec: async (_command: string, args: string[]) => {
        const gitArgs = args.slice(2);
        if (gitArgs[0] === "status") return { stdout: ` M CONTEXT-MAP.md
?? docs/spec.md
`, stderr: "", code: 0 };
        if (gitArgs[0] === "branch") return { stdout: "feat/herald\n", stderr: "", code: 0 };
        if (gitArgs[0] === "log") return { stdout: "abc123 change\n", stderr: "", code: 0 };
        return { stdout: "", stderr: "", code: 0 };
      },
    };

    const context = await collectGitContext(pi as never, "/repo");

    expect(context.changedFiles).toEqual(["CONTEXT-MAP.md", "docs/spec.md"]);
  });
});

describe("remote detection", () => {
  it("parses SSH and HTTPS remote URLs", () => {
    expect(parseRemoteUrl("git@github.com:team/project.git")).toEqual({
      host: "github.com",
      repository: "team/project",
    });
    expect(parseRemoteUrl("https://gitlab.example/team/project.git")).toEqual({
      host: "gitlab.example",
      repository: "team/project",
    });
  });

  it("recognizes GitHub Enterprise Cloud hosts", () => {
    expect(detectKnownProvider("github.com")).toBe("github");
    expect(detectKnownProvider("example.ghe.com")).toBe("github");
    expect(detectKnownProvider("gitlab.com")).toBe("gitlab");
    expect(detectKnownProvider("git.example.com")).toBeUndefined();
  });

  it("normalizes an explicit hosted target repository", () => {
    expect(normalizeTargetRepository("example.ghe.com/team/project", "github.com")).toEqual({
      host: "example.ghe.com",
      repository: "team/project",
    });
    expect(normalizeTargetRepository("team/project", "github.com")).toEqual({
      host: "github.com",
      repository: "team/project",
    });
  });

  it("builds a fork head reference", () => {
    expect(requestHead({ ...sourceRemote, name: "fork" }, "feature/provider", "github")).toBe("team:feature/provider");
    expect(requestHead(sourceRemote, "feature/provider", "github")).toBe("feature/provider");
  });
});

describe("Herald command parsing", () => {
  it("parses modes and workflow options", () => {
    const parsed = parseCommandArgs("request --provider github --target main --target-repo team/project --allow-dirty");
    expect(parsed.errors).toEqual([]);
    expect(parsed.options).toEqual({
      mode: "request",
      provider: "github",
      targetBranch: "main",
      targetRepository: "team/project",
      allowDirty: true,
    });
  });

  it("accepts provider-specific aliases", () => {
    expect(parseCommandArgs("mr").options.mode).toBe("request");
    expect(parseCommandArgs("pr").options.mode).toBe("request");
  });
});

describe("commit plan validation", () => {
  it("requires every changed file to be accounted for once", () => {
    expect(validateCommitGroups([
      { files: ["src/a.ts"], message: "feat: add a" },
      { files: ["src/b.ts"], message: "test: cover b" },
    ], ["src/a.ts", "src/b.ts"], [])).toEqual([]);

    expect(validateCommitGroups([
      { files: ["src/a.ts", "src/a.ts"], message: "feat: duplicate" },
    ], ["src/a.ts"], [])).toContain("File appears in more than one commit: src/a.ts");
  });
});

describe("Git write protection", () => {
  it("allows simple read-only Git commands", () => {
    expect(isReadOnlyGitCommand("git status")).toBe(true);
    expect(isReadOnlyGitCommand("git diff --cached")).toBe(true);
    expect(isReadOnlyGitCommand("git log -5")).toBe(true);
  });

  it("rejects mutating or compound Git commands", () => {
    expect(isReadOnlyGitCommand("git commit -m message")).toBe(false);
    expect(isReadOnlyGitCommand("git status && git reset --hard")).toBe(false);
  });
});

describe("request execution", () => {
  it("passes the temporary body file path to GitHub", async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
    let requestArgs: string[] | undefined;
    const api = {
      appendEntry: vi.fn(),
      getActiveTools: vi.fn(() => ["read", "bash"]),
      setActiveTools: vi.fn(),
      on: vi.fn(),
      registerTool: vi.fn((tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool)),
      registerCommand: vi.fn((name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => commands.set(name, command)),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async (command: string, args: string[]) => {
        if (command === "gh") {
          if (args[0] === "pr" && args[1] === "create") requestArgs = args;
          return { stdout: args[0] === "pr" && args[1] === "create" ? "https://example.ghe.com/team/project/pull/1" : "{}", stderr: "", code: 0 };
        }
        const gitArgs = args.slice(2);
        if (gitArgs[0] === "remote") return { stdout: "origin\tgit@example.ghe.com:team/project.git (fetch)\norigin\tgit@example.ghe.com:team/project.git (push)\n", stderr: "", code: 0 };
        if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--abbrev-ref") return { stdout: "", stderr: "", code: 1 };
        if (gitArgs[0] === "rev-parse" && gitArgs[1] === "HEAD") return { stdout: "head123\n", stderr: "", code: 0 };
        if (gitArgs[0] === "rev-parse" && gitArgs[1] === "origin/main") return { stdout: "base123\n", stderr: "", code: 0 };
        if (gitArgs[0] === "rev-parse") return { stdout: ".git\n", stderr: "", code: 0 };
        if (gitArgs[0] === "ls-remote") return { stdout: "base123\\trefs/heads/main\\n", stderr: "", code: 0 };
        if (gitArgs[0] === "branch") return { stdout: "feature/provider\n", stderr: "", code: 0 };
        if (gitArgs[0] === "status") return { stdout: "", stderr: "", code: 0 };
        if (gitArgs[0] === "log" || gitArgs[0] === "diff") return { stdout: "", stderr: "", code: 0 };
        if (gitArgs[0] === "fetch" || gitArgs[0] === "push") return { stdout: "", stderr: "", code: 0 };
        return { stdout: "", stderr: "", code: 0 };
      }),
    };
    heraldExtension(api as never);

    const ctx = {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        notify: vi.fn(),
        input: vi.fn(async () => undefined),
        confirm: vi.fn(async () => true),
        select: vi.fn(async () => "Approve"),
        editor: vi.fn(async (_title: string, initial: string) => initial),
      },
    };
    await commands.get("herald")!.handler("request --provider github --target main --target-repo example.ghe.com/team/project", ctx);
    await tools.get("herald_request_plan")!.execute("request", { title: "Add provider", body: "## Summary\\n\\nAdd provider support." }, undefined, undefined, ctx);

    const bodyIndex = requestArgs!.indexOf("--body-file");
    expect(bodyIndex).toBeGreaterThan(-1);
    expect(requestArgs![bodyIndex + 1]).toMatch(/pi-herald-.*request\.md$/);
  });
});

describe("provider command construction", () => {
  it("passes the GitHub Enterprise hostname and body file", () => {
    expect(createRequestArgs(requestInput)).toEqual([
      "pr",
      "create",
      "--repo",
      "example.ghe.com/team/project",
      "--head",
      "user:feature/provider",
      "--base",
      "main",
      "--title",
      "Add provider",
      "--body-file",
      "/tmp/herald/request.md",
    ]);
  });

  it("builds provider-specific request lookup arguments", () => {
    expect(listRequestArgs("gitlab", "gitlab.example", "team/project", "feature/provider", "develop")).toContain("--source-branch");
    expect(listRequestArgs("github", "github.com", "team/project", "feature/provider", "main")).toContain("--head");
  });
});
