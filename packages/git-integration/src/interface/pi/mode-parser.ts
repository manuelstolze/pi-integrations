import type { GitMode } from "../../domain/git-mode.js";
import { HeraldError } from "../../application/errors.js";

export function parseHeraldMode(args: string): GitMode {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "full";

  if (tokens.length !== 1) {
    throw invalidMode();
  }

  const token = tokens[0].toLowerCase();
  if (token === "commit") return "commit";
  if (token === "request") return "request";

  throw invalidMode();
}

function invalidMode(): HeraldError {
  return new HeraldError(
    "invalid-mode",
    "Invalid Herald mode. Use /herald, /herald commit, or /herald request.",
  );
}
