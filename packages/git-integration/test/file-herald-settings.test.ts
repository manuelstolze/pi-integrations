import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileHeraldSettings } from "../src/infrastructure/config/file-herald-settings.js";
import { resolveHeraldSettings } from "../src/domain/herald-settings.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "herald-settings-"));
  directories.push(root);
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  await mkdir(agentDir);
  await mkdir(join(cwd, ".pi"), { recursive: true });
  return {
    agentDir, cwd,
    user: join(agentDir, "settings.json"),
    project: join(cwd, ".pi", "settings.json"),
    adapter: new FileHeraldSettings(agentDir),
  };
}

describe("File Herald settings", () => {
  it("treats missing files as normal", async () => {
    const { adapter, cwd } = await setup();
    expect(await adapter.read({ cwd, projectTrusted: true })).toEqual({ sources: [], problems: [] });
  });

  it("reads both sources without changing contents and reloads on each read", async () => {
    const { adapter, cwd, user, project } = await setup();
    const userContent = JSON.stringify({ herald: { model: "user/model", thinkingLevel: "high" } });
    await writeFile(user, userContent);
    await writeFile(project, JSON.stringify({ herald: { thinkingLevel: "low" } }));
    const first = await adapter.read({ cwd, projectTrusted: true });
    expect(resolveHeraldSettings(first.sources)).toMatchObject({
      model: { path: user, value: { provider: "user", id: "model" } },
      thinkingLevel: { path: project, value: "low" },
    });
    await writeFile(project, JSON.stringify({ herald: { thinkingLevel: "medium" } }));
    expect(resolveHeraldSettings((await adapter.read({ cwd, projectTrusted: true })).sources).thinkingLevel?.value).toBe("medium");
    expect(await readFile(user, "utf8")).toBe(userContent);
    expect(await readFile(project, "utf8")).toBe(JSON.stringify({ herald: { thinkingLevel: "medium" } }));
  });

  it("does not read an untrusted project", async () => {
    const { adapter, cwd, user, project } = await setup();
    await writeFile(user, JSON.stringify({ herald: { model: "user/model" } }));
    await writeFile(project, "bad JSON secret");
    const result = await adapter.read({ cwd, projectTrusted: false });
    expect(result.problems).toEqual([]);
    expect(result.sources.map((source) => source.path)).toEqual([user]);
  });

  it("retains the good source when another file has malformed JSON", async () => {
    const { adapter, cwd, user, project } = await setup();
    await writeFile(user, "{ secret");
    await writeFile(project, JSON.stringify({ herald: { thinkingLevel: "low" } }));
    const result = await adapter.read({ cwd, projectTrusted: true });
    expect(result.problems).toEqual([{ field: "herald", path: user, reason: "json" }]);
    expect(result.sources.map((source) => source.path)).toEqual([project]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("reports file read failures without exposing file contents", async () => {
    const { adapter, cwd, user } = await setup();
    await mkdir(user);
    expect((await adapter.read({ cwd, projectTrusted: true })).problems).toEqual([
      { field: "herald", path: user, reason: "read" },
    ]);
  });

  it("accepts a UTF-8 byte order mark", async () => {
    const { adapter, cwd, user } = await setup();
    await writeFile(user, '\uFEFF{"herald":{"thinkingLevel":"high"}}');
    expect((await adapter.read({ cwd, projectTrusted: true })).problems).toEqual([]);
  });
});
