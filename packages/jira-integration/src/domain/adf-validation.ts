import { default as AjvImport } from "ajv-draft-04";
import schema from "./adf/full-schema.json" with { type: "json" };
import type { AdfDocument } from "./description-update.js";

// The CommonJS package also publishes its constructor as `default`.
const Ajv = AjvImport.default;
const validator = new Ajv({ strict: false, coerceTypes: false, removeAdditional: false, useDefaults: false }).compile(schema);
const contentLeaves = new Set(["mention", "emoji", "date", "status", "inlineCard", "blockCard", "embedCard", "media", "mediaInline", "extension", "syncBlock", "rule"]);

function hasContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.type === "text") return typeof node.text === "string" && node.text.trim().length > 0;
  if (typeof node.type === "string" && contentLeaves.has(node.type)) return true;
  return Array.isArray(node.content) && node.content.some(hasContent);
}

export function requireAdf(value: unknown): AdfDocument {
  if (!validator(value)) {
    const error = validator.errors?.[0];
    throw new Error(`Invalid ADF document at ${error?.instancePath || "/"}: ${error?.message ?? "schema validation failed"}.`);
  }
  if (!hasContent(value)) throw new Error("The description must not be empty or contain only whitespace.");
  return structuredClone(value) as AdfDocument;
}
