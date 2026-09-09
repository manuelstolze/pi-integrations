import type { CommitGroup, HeraldMode, HeraldOptions, ValidationResult } from "./types.js";

export interface ParsedCommand {
  options: HeraldOptions;
  errors: string[];
}

export function parseCommandArgs(args: string): ParsedCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let mode: HeraldMode = "both";
  const options: HeraldOptions = { mode, allowDirty: false };
  const errors: string[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      if (token === "commit") mode = "commit";
      else if (token === "request" || token === "mr" || token === "pr") mode = "request";
      else errors.push(`Unknown Herald mode: ${token}`);
      continue;
    }
    if (token === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) {
      errors.push(`Option ${token} requires a value.`);
      continue;
    }
    index++;
    if (key === "provider") {
      if (value !== "github" && value !== "gitlab") errors.push(`Unknown provider: ${value}`);
      else options.provider = value;
    } else if (key === "target") options.targetBranch = value;
    else if (key === "template") options.template = value;
    else if (key === "push-remote") options.pushRemote = value;
    else if (key === "target-remote") options.targetRemote = value;
    else if (key === "target-repo") options.targetRepository = value;
    else errors.push(`Unknown Herald option: ${token}`);
  }

  options.mode = mode;
  return { options, errors };
}

export function validateCommitGroups(
  groups: CommitGroup[],
  changedFiles: string[],
  untouchedFiles: string[] = [],
): string[] {
  const errors: string[] = [];
  const changed = new Set(changedFiles);
  const seen = new Set<string>();

  for (const [index, group] of groups.entries()) {
    if (group.files.length === 0) errors.push(`Commit ${index + 1} has no files.`);
    if (!group.message.trim()) errors.push(`Commit ${index + 1} has no message.`);
    for (const file of group.files) {
      if (!changed.has(file)) errors.push(`Commit ${index + 1} includes unchanged file: ${file}`);
      if (seen.has(file)) errors.push(`File appears in more than one commit: ${file}`);
      seen.add(file);
    }
  }

  for (const file of untouchedFiles) {
    if (!changed.has(file)) errors.push(`Untouched list includes unchanged file: ${file}`);
    if (seen.has(file)) errors.push(`File is both committed and untouched: ${file}`);
    seen.add(file);
  }

  for (const file of changed) {
    if (!seen.has(file)) errors.push(`Changed file is missing from the plan: ${file}`);
  }
  return errors;
}

export function validationFailures(results: ValidationResult[]): ValidationResult[] {
  return results.filter((result) => !result.passed);
}

export function formatCommitPlan(groups: CommitGroup[], untouchedFiles: string[], validation: ValidationResult[]): string {
  const lines: string[] = ["Herald commit plan", ""];
  groups.forEach((group, index) => {
    lines.push(`Commit ${index + 1}`, `Files: ${group.files.join(", ")}`, "Message:", group.message, "");
  });
  if (untouchedFiles.length > 0) {
    lines.push("Untouched files:", ...untouchedFiles.map((file) => `- ${file}`), "");
  }
  if (validation.length > 0) {
    lines.push("Validation:", ...validation.map((item) => `- ${item.command} — ${item.passed ? "passed" : "failed"}: ${item.result}`));
  }
  return lines.join("\n");
}

export function formatRequestDraft(title: string, body: string, provider: "github" | "gitlab", targetRepository: string, targetBranch: string): string {
  return [
    `Herald ${provider === "github" ? "pull request" : "merge request"} draft`,
    `Target: ${targetRepository}:${targetBranch}`,
    `Title: ${title}`,
    "",
    body,
  ].join("\n");
}
