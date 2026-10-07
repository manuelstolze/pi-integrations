import { describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMAND_TIMEOUT_MS, ExecProcessRunner } from "../src/infrastructure/process/process-runner.js";

describe("ExecProcessRunner", () => {
  it("runs a command in its bound worktree with the shared timeout", async () => {
    const exec = vi.fn(async () => ({ stdout: " output\n", stderr: " warning\n", code: 0 }));
    const runner = new ExecProcessRunner(exec, "/worktree");

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
    const runner = new ExecProcessRunner(exec, "/worktree");

    await expect(runner.run("git", ["status"])).resolves.toEqual({
      stdout: "",
      stderr: "spawn failed",
      code: -1,
    });
  });
});
