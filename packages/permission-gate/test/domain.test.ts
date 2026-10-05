import { describe, expect, it } from "vitest";
import { evaluateCommand } from "../src/domain/permission-rules.ts";
import { findCommandPattern, matchesCommandPattern } from "../src/domain/patterns.ts";

describe("permission rules", () => {
  it("checks auto-deny rules before allow rules", () => {
    const result = evaluateCommand(
      "az group delete --name demo",
      true,
      [{ pattern: "az group delete" }],
      [],
    );

    expect(result).toMatchObject({ kind: "auto-deny", rule: { pattern: "az group delete" } });
  });

  it("allows a command that matches a configured allow pattern", () => {
    expect(evaluateCommand("git status", false, [{ pattern: "git status" }], [])).toEqual({
      kind: "allow",
    });
  });

  it("requests approval for a matching dangerous pattern", () => {
    expect(evaluateCommand("sudo reboot", false, [], [{ pattern: "sudo", description: "admin" }])).toEqual({
      kind: "requires-approval",
      pattern: { pattern: "sudo", description: "admin" },
    });
  });

  it("allows commands that do not match dangerous patterns", () => {
    expect(evaluateCommand("git status", false, [], [{ pattern: "sudo" }])).toEqual({ kind: "allow" });
  });

  it("uses literal matching unless regex mode is enabled", () => {
    expect(matchesCommandPattern({ pattern: "sudo" }, "sudo reboot")).toBe(true);
    expect(matchesCommandPattern({ pattern: "^sudo$", regex: true }, "sudo reboot")).toBe(false);
  });

  it("ignores invalid regular expressions", () => {
    expect(matchesCommandPattern({ pattern: "[", regex: true }, "anything")).toBe(false);
  });

  it("returns the first matching pattern", () => {
    const first = { pattern: "sudo" };
    expect(findCommandPattern("sudo reboot", [first, { pattern: "reboot" }])).toBe(first);
  });
});
