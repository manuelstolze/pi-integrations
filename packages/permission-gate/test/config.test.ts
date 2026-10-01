import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readConfig, testPattern, writeExactAllowRule } from "../src/config.ts";

const temporaryDirectories: string[] = [];

function temporaryPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "pi-permission-gate-"));
  temporaryDirectories.push(directory);
  return join(directory, "nested", "guardrails.json");
}

function writeConfig(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("permission gate config", () => {
  it("treats a missing config file as an empty config", () => {
    expect(readConfig(temporaryPath())).toEqual({ config: {} });
  });

  it("reports malformed JSON and does not replace it when saving", () => {
    const path = temporaryPath();
    const original = "{ not valid json";
    writeConfig(path, original);

    expect(readConfig(path).error).toBeInstanceOf(Error);
    expect(() => writeExactAllowRule("sudo reboot", path)).toThrow("Cannot update invalid guardrails config");
    expect(readFileSync(path, "utf-8")).toBe(original);
  });

  it("rejects invalid config fields", () => {
    const path = temporaryPath();
    writeConfig(path, JSON.stringify({ permissionGate: { allowedPatterns: "sudo" } }));

    expect(readConfig(path).error?.message).toContain("invalid structure");
  });

  it("creates the config directory and saves a full-command regex", () => {
    const path = temporaryPath();
    const command = "tool --path=/tmp/a.b [value]";

    const rule = writeExactAllowRule(command, path);
    const saved = JSON.parse(readFileSync(path, "utf-8")) as {
      permissionGate: { allowedPatterns: Array<{ pattern: string; regex?: boolean }> };
    };

    expect(rule.regex).toBe(true);
    expect(testPattern(rule, command)).toBe(true);
    expect(testPattern(rule, `${command} --extra`)).toBe(false);
    expect(saved.permissionGate.allowedPatterns).toEqual([rule]);
  });

  it("supports literal and regex patterns and ignores invalid regex rules", () => {
    expect(testPattern({ pattern: "sudo" }, "sudo reboot")).toBe(true);
    expect(testPattern({ pattern: "^sudo$", regex: true }, "sudo reboot")).toBe(false);
    expect(testPattern({ pattern: "[", regex: true }, "anything")).toBe(false);
  });
});
