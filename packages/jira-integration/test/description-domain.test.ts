import { describe, expect, it } from "vitest";
import { requireAdf } from "../src/domain/adf-validation.js";
import { equalJson, issueKey, validateUpdateInput } from "../src/domain/description-update.js";

export const doc = (text = "New description") => ({ type: "doc" as const, version: 1 as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("description rules", () => {
  it("validates and copies ADF without changing formatting", () => {
    const value = doc();
    const before = structuredClone(value);
    expect(requireAdf(value)).toEqual(before);
    expect(requireAdf(value)).not.toBe(value);
    expect(value).toEqual(before);
  });
  it.each([null, "text", {}, { ...doc(), version: 2 }, { ...doc(), content: [{ type: "unknown" }] }, doc(" "), { ...doc(), content: [] }, { ...doc(), content: [{ type: "paragraph" }] }, { ...doc(), content: [{ type: "paragraph", content: [{ type: "hardBreak" }] }] }, { ...doc(), content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] }] }] }])("rejects malformed or blank descriptions: %j", (value) => {
    expect(() => requireAdf(value)).toThrow();
  });
  it("accepts meaningful non-text content", () => {
    expect(requireAdf({ ...doc(), content: [{ type: "rule" }] })).toBeDefined();
    expect(requireAdf({ ...doc(), content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "user-1" } }] }] })).toBeDefined();
  });
  it("compares complete document structure, not object key order or plain text", () => {
    expect(equalJson({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(equalJson([1, 2], [2, 1])).toBe(false);
    expect(equalJson(doc(), { ...doc(), content: [{ type: "paragraph", content: [{ type: "text", text: "New description", marks: [{ type: "strong" }] }] }] })).toBe(false);
    expect(equalJson(null, {})).toBe(false);
  });
  it.each(["D3X-1,OTHER-2", " D3X-1", "project = D3X", "", "D3X-0", ["D3X-1"]])("rejects non-single keys: %j", (key) => expect(() => issueKey(key)).toThrow());
  it("rejects extra fields, approval flags, and apply replacements", () => {
    expect(issueKey("D3X-123")).toBe("D3X-123");
    expect(() => validateUpdateInput({ action: "prepare", issueKey: "D3X-1", description: doc() })).not.toThrow();
    for (const value of [{ action: "apply", proposalId: "id", approved: true }, { action: "prepare", issueKey: "D3X-1", description: doc(), acceptanceCriteria: doc() }, { action: "apply", proposalId: "id", description: doc() }, { action: "clear", proposalId: "id" }]) expect(() => validateUpdateInput(value)).toThrow();
  });
});
