import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import gitIntegrationExtension from "../src/index.js";
import { detectHostingProvider, parseMode, providerFromRemoteUrl } from "../src/git.js";
import { getGitIntegrationInstructions } from "../src/instructions.js";

describe("providerFromRemoteUrl", () => {
    it("detects GitHub from HTTPS and SSH remotes", () => {
        expect(providerFromRemoteUrl("https://github.com/owner/repo.git")).toBe("github");
        expect(providerFromRemoteUrl("git@github.com:owner/repo.git")).toBe("github");
    });

    it("does not guess a provider for a non-GitHub host", () => {
        expect(providerFromRemoteUrl("git@gitlab.example.com:group/repo.git")).toBeNull();
        expect(providerFromRemoteUrl("https://code.example.com/group/repo.git")).toBeNull();
    });
});

describe("detectHostingProvider", () => {
    it("uses GitHub without probing GitLab", async () => {
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: "git@github.com:owner/repo.git", stderr: "", code: 0 })
            .mockResolvedValueOnce({ stdout: "main", stderr: "", code: 0 });
        const api = { exec } as unknown as ExtensionAPI;

        await expect(detectHostingProvider(api, "/worktree")).resolves.toBe("github");
        expect(exec).toHaveBeenCalledTimes(2);
        expect(exec).toHaveBeenLastCalledWith(
            "gh",
            ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"],
            { cwd: "/worktree", timeout: 10000 },
        );
    });

    it("probes glab for a non-GitHub origin", async () => {
        const exec = vi.fn()
            .mockResolvedValueOnce({ stdout: "git@gitlab.example.com:group/repo.git", stderr: "", code: 0 })
            .mockResolvedValueOnce({ stdout: "{}", stderr: "", code: 0 });
        const api = { exec } as unknown as ExtensionAPI;

        await expect(detectHostingProvider(api, "/worktree")).resolves.toBe("gitlab");
        expect(exec).toHaveBeenLastCalledWith(
            "glab",
            ["repo", "view", "--output", "json"],
            { cwd: "/worktree", timeout: 10000 },
        );
    });

    it("rejects a repository without a usable origin", async () => {
        const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "No such remote", code: 2 });
        const api = { exec } as unknown as ExtensionAPI;

        await expect(detectHostingProvider(api, "/worktree"))
            .rejects.toThrow("No usable origin remote found");
    });
});

describe("provider instructions", () => {
    it("bind GitHub request instructions to gh", () => {
        const instructions = getGitIntegrationInstructions("github");

        expect(instructions).toContain("gh pr create");
        expect(instructions).toContain("gh repo view");
        expect(instructions).not.toContain("glab mr create");
        expect(instructions).not.toContain("--remove-source-branch");
    });

    it("bind GitLab request instructions to glab", () => {
        const instructions = getGitIntegrationInstructions("gitlab");

        expect(instructions).toContain("glab mr create");
        expect(instructions).toContain("--remove-source-branch");
        expect(instructions).not.toContain("gh pr create");
    });
});

describe("parseMode", () => {
    it("defaults to full mode when no mode is provided", () => {
        expect(parseMode(""))
            .toBe("full");
    });

    it("parses commit mode", () => {
        expect(parseMode("commit")).toBe("commit");
    });

    it("parses request mode", () => {
        expect(parseMode("request")).toBe("request");
    });

    it("normalizes case and whitespace", () => {
        expect(parseMode("  ReQuEsT  ")).toBe("request");
    });

    it.each(["mr", "typo", "--unknown", "commit extra"]) (
        "rejects unsupported input: %s",
        (args) => {
            expect(() => parseMode(args)).toThrow(
                "Invalid Herald mode. Use /herald, /herald commit, or /herald request.",
            );
        },
    );
});

describe("/herald command", () => {
    it("rejects a request without a usable origin before starting the agent", async () => {
        const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
        const api = {
            on: vi.fn(),
            exec: vi.fn()
                .mockResolvedValueOnce({ stdout: ".git", stderr: "", code: 0 })
                .mockResolvedValueOnce({ stdout: "", stderr: "No such remote", code: 2 }),
            registerCommand: vi.fn((name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
                commands.set(name, options);
            }),
            sendUserMessage: vi.fn(),
        } as unknown as ExtensionAPI;
        const notify = vi.fn();
        const context = {
            hasUI: true,
            cwd: "/tmp",
            ui: { notify },
        } as unknown as ExtensionCommandContext;

        gitIntegrationExtension(api);
        await commands.get("herald")!.handler("request", context);

        expect(notify).toHaveBeenCalledWith(
            "No usable origin remote found. Configure a GitHub or GitLab origin remote first.",
            "error",
        );
        expect(api.sendUserMessage).not.toHaveBeenCalled();
    });

    it("rejects an invalid mode before checking the repository", async () => {
        const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
        const api = {
            on: vi.fn(),
            exec: vi.fn(),
            registerCommand: vi.fn((name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => {
                commands.set(name, options);
            }),
        } as unknown as ExtensionAPI;
        const notify = vi.fn();
        const context = {
            hasUI: true,
            cwd: "/tmp",
            ui: { notify },
        } as unknown as ExtensionCommandContext;

        gitIntegrationExtension(api);
        await commands.get("herald")!.handler("mr", context);

        expect(notify).toHaveBeenCalledWith(
            "Invalid Herald mode. Use /herald, /herald commit, or /herald request.",
            "error",
        );
        expect(api.exec).not.toHaveBeenCalled();
    });
});
