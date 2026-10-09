import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilePermissionConfigAdapter } from "../src/infrastructure/config/file-permission-config-adapter.ts";
import { matchesCommandPattern } from "../src/domain/patterns.ts";

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

describe("permission config infrastructure", () => {
  it("treats a missing file as an empty config", () => {
    expect(new FilePermissionConfigAdapter(temporaryPath()).load()).toEqual({ configuration: {} });
  });

  it("reports malformed JSON and does not replace it when saving", () => {
    const path = temporaryPath();
    const original = "{ not valid json";
    writeConfig(path, original);
    const adapter = new FilePermissionConfigAdapter(path);

    expect(adapter.load().error).toBeInstanceOf(Error);
    expect(() => adapter.saveExactAllowRule("sudo reboot")).toThrow("Cannot update invalid guardrails config");
    expect(readFileSync(path, "utf-8")).toBe(original);
  });

  it("maps permission-gate settings from the stored config", () => {
    const path = temporaryPath();
    writeConfig(
      path,
      JSON.stringify({
        applyBuiltinDefaults: false,
        permissionGate: {
          patterns: [{ pattern: "terraform destroy" }],
          allowedPatterns: [{ pattern: "git status" }],
        },
      }),
    );

    expect(new FilePermissionConfigAdapter(path).load()).toEqual({
      configuration: {
        applyBuiltinDefaults: false,
        dangerousPatterns: [{ pattern: "terraform destroy" }],
        allowedPatterns: [{ pattern: "git status" }],
      },
    });
  });

  it("rejects invalid config fields", () => {
    const path = temporaryPath();
    writeConfig(path, JSON.stringify({ permissionGate: { allowedPatterns: "sudo" } }));

    expect(new FilePermissionConfigAdapter(path).load().error?.message).toContain("invalid structure");
  });

  it("creates the config directory and saves a full-command regular expression", () => {
    const path = temporaryPath();
    const command = "tool --path=/tmp/a.b [value]";

    const rule = new FilePermissionConfigAdapter(path).saveExactAllowRule(command);
    const saved = JSON.parse(readFileSync(path, "utf-8")) as {
      permissionGate: { allowedPatterns: Array<{ pattern: string; regex?: boolean }> };
    };

    expect(rule.regex).toBe(true);
    expect(matchesCommandPattern(rule, command)).toBe(true);
    expect(matchesCommandPattern(rule, `${command} --extra`)).toBe(false);
    expect(saved.permissionGate.allowedPatterns).toEqual([rule]);
  });

  it("preserves other settings when it saves an allow rule", () => {
    const path = temporaryPath();
    const original = { applyBuiltinDefaults: false, otherExtension: { enabled: true } };
    writeConfig(path, JSON.stringify(original));

    new FilePermissionConfigAdapter(path).saveExactAllowRule("sudo reboot");

    expect(JSON.parse(readFileSync(path, "utf-8"))).toMatchObject({
      ...original,
      permissionGate: { allowedPatterns: [{ pattern: "^sudo reboot$", regex: true }] },
    });
  });
});
