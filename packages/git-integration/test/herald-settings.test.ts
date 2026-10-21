import { describe, expect, it } from "vitest";
import { resolveHeraldSettings, THINKING_LEVELS } from "../src/domain/herald-settings.js";

const source = (herald: unknown, path = "user/settings.json") => ({ path, value: { herald } });

describe("Herald settings", () => {
  it("keeps absent settings absent and ignores unrelated keys", () => {
    expect(resolveHeraldSettings([{ path: "user", value: { theme: "dark" } }])).toEqual({ problems: [] });
    expect(resolveHeraldSettings([source({ future: true })])).toEqual({ problems: [] });
  });

  it("splits an exact model reference on the first slash", () => {
    expect(resolveHeraldSettings([source({ model: "openrouter/team/model" })]).model).toEqual({
      path: "user/settings.json", value: { provider: "openrouter", id: "team/model" },
    });
  });

  it.each(THINKING_LEVELS)("accepts thinking level %s", (thinkingLevel) => {
    expect(resolveHeraldSettings([source({ thinkingLevel })]).thinkingLevel?.value).toBe(thinkingLevel);
  });

  it.each(["", "provider", "/model", "provider/", " provider/model", 42, null, []])("rejects model %j", (model) => {
    const settings = resolveHeraldSettings([source({ model })]);
    expect(settings.model).toEqual({ path: "user/settings.json" });
    expect(settings.problems).toContainEqual({ field: "herald.model", path: "user/settings.json", reason: "invalid" });
  });

  it.each(["invalid", 42, null, []])("rejects thinking level %j", (thinkingLevel) => {
    expect(resolveHeraldSettings([source({ thinkingLevel })]).problems).toContainEqual({
      field: "herald.thinkingLevel", path: "user/settings.json", reason: "invalid",
    });
  });

  it("overrides each field independently", () => {
    const user = source({ model: "user/model", thinkingLevel: "high" });
    expect(resolveHeraldSettings([user, source({ model: "project/model" }, "project")])).toMatchObject({
      model: { path: "project", value: { provider: "project", id: "model" } },
      thinkingLevel: { path: "user/settings.json", value: "high" },
    });
    expect(resolveHeraldSettings([user, source({ thinkingLevel: "low" }, "project")])).toMatchObject({
      model: { path: "user/settings.json", value: { provider: "user", id: "model" } },
      thinkingLevel: { path: "project", value: "low" },
    });
  });

  it("does not reactivate a user value behind an invalid project override", () => {
    const resolved = resolveHeraldSettings([
      source({ model: "user/model", thinkingLevel: "high" }),
      source({ model: null }, "project"),
    ]);
    expect(resolved.model).toEqual({ path: "project" });
    expect(resolved.thinkingLevel?.value).toBe("high");
    expect(resolved.problems).toHaveLength(1);
  });

  it.each([null, [], "bad", 42])("reports an invalid herald object %j", (herald) => {
    const resolved = resolveHeraldSettings([source({ model: "user/model" }), source(herald, "project")]);
    expect(resolved.model).toEqual({ path: "project" });
    expect(resolved.problems).toContainEqual({ field: "herald", path: "project", reason: "invalid" });
  });

  it("reports invalid file root shapes", () => {
    expect(resolveHeraldSettings([{ path: "user", value: [] }]).problems).toContainEqual({
      field: "herald", path: "user", reason: "invalid",
    });
  });

  it("validates effective fields, not overridden user values", () => {
    const resolved = resolveHeraldSettings([source({ model: false }), source({ model: "project/model" }, "project")]);
    expect(resolved.problems).toEqual([]);
  });
});
