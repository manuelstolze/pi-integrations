import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_COMMAND_TIMEOUT_MS, PiProcessRunner } from "../src/adapters/process/process-runner.js";

describe("PiProcessRunner", () => {
  it("runs a command in its bound worktree with the shared timeout", async () => {
    const exec = vi.fn(async () => ({ stdout: " output\n", stderr: " warning\n", code: 0 }));
    const runner = new PiProcessRunner({ exec } as unknown as ExtensionAPI, "/worktree");

    await expect(runner.run("git", ["status"])).resolves.toEqual({
      stdout: "output",
      stderr: "warning",
      code: 0,
    });
    expect(exec).toHaveBeenCalledWith("git", ["status"], {
      cwd: "/worktree",
      timeout: DEFAULT_COMMAND_TIMEOUT_MS,
    });
  });

  it("maps process errors to a failed result", async () => {
    const exec = vi.fn(async () => {
      throw new Error("spawn failed");
    });
    const runner = new PiProcessRunner({ exec } as unknown as ExtensionAPI, "/worktree");

    await expect(runner.run("git", ["status"])).resolves.toEqual({
      stdout: "",
      stderr: "spawn failed",
      code: -1,
    });
  });
});
