import type { PreparedHeraldRun } from "../../application/use-cases/prepare-herald-run.js";

export function renderHeraldTask(run: PreparedHeraldRun): string {
  const modeNote: Record<PreparedHeraldRun["mode"], string> = {
    commit: "**Mode: commit only.** Establish policy, plan, and execute commits (Steps 1–6). Do NOT push or create a review request.",
    request: "**Mode: request only.** Establish policy, prepare the review request, and push/create it (Steps 1 and 7–8). The commits are already done.",
    full: "**Mode: full flow.** Complete all steps 1–9.",
  };

  const diffSection = run.mode === "request"
    ? renderRequestDiff(run)
    : renderWorkingTreeDiff(run.snapshot.stagedDiff, run.snapshot.unstagedDiff);

  const lines = [
    `## Git Integration — ${run.mode} mode`,
    "",
    modeNote[run.mode],
    "",
    "## Branch",
    `\`${run.snapshot.branch || "(unknown)"}\``,
    "",
    "## Git Status",
    "```",
    run.snapshot.status || "(clean)",
    "```",
    "",
    diffSection,
    "",
    "## Recent Commits",
    "```",
    run.snapshot.recentCommits || "(no commits yet)",
    "```",
    "",
    "---",
    "",
    "Check for and read `CONTRIBUTING.md` first when it is available. It is the " +
      "repository's source of truth for the rules it defines; use Git Integration's fallback " +
      "defaults only for topics it does not cover.",
    "If `CONTRIBUTING.md` is missing or unreadable, mention that and use the fallback rules.",
    "",
    "Begin by reading `CONTRIBUTING.md` before reviewing or grouping changes.",
    "",
    "Begin.",
  ];

  return lines.join("\n");
}

function renderWorkingTreeDiff(staged: string, unstaged: string): string {
  const parts: string[] = [];
  if (staged) parts.push(`### Staged\n\`\`\`diff\n${truncate(staged, 8000)}\n\`\`\``);
  if (unstaged) parts.push(`### Unstaged\n\`\`\`diff\n${truncate(unstaged, 8000)}\n\`\``);
  return parts.length > 0
    ? `## Changes\n\n${parts.join("\n\n")}`
    : "## Changes\n\n(no changes detected — working tree is clean)";
}

function renderRequestDiff(run: Extract<PreparedHeraldRun, { mode: "request" }>): string {
  if (run.diff.kind === "no-target") {
    return "## Diff vs base\n(no local target-branch ref found — inspect the target branch before creating the review request)";
  }

  if (run.diff.kind === "read-error") {
    return `## Diff vs \`${run.diff.baseRef}\`\n(could not read the diff: ${run.diff.message})`;
  }

  return run.diff.text
    ? `## Diff vs \`${run.diff.baseRef}\`\n\`\`\`diff\n${truncate(run.diff.text, 14000)}\n\`\`\``
    : `## Diff vs \`${run.diff.baseRef}\`\n(no diff found against \`${run.diff.baseRef}\`)`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n\n... [truncated — ${text.length - maxLen} additional characters omitted]`;
}
