import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import gitIntegrationExtension from "../src/index.js";
import { parseMode } from "../src/git.js";

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
