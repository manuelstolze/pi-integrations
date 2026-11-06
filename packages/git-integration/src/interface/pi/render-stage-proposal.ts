import type { PreparedStageProposal } from "../../application/ports/stage-input-check-ports.js";

export function renderStageProposal(proposalId: string, proposal: PreparedStageProposal): string {
  const lines = [
    `# ${proposal.stage === "commit" ? "Commit" : "Review-request"} proposal`,
    `Proposal ID: ${proposalId}`,
    "A later clear, unconditional chat reply can approve only the commands below.",
    "",
  ];

  if (proposal.stage === "commit") {
    proposal.commits.forEach((commit, index) => {
      lines.push(
        `## Commit ${index + 1}`,
        "Files:",
        ...commit.files.map((file) => `- ${inlineCode(file)}`),
        "Complete commit message:",
        codeBlock(commit.message),
        "Exact command:",
        codeBlock(commit.command, "bash"),
        "",
      );
    });
    return lines.join("\n").trimEnd();
  }

  lines.push(
    `Provider: ${proposal.provider}`,
    `Source branch: ${inlineCode(proposal.sourceBranch)}`,
    `Target branch: ${inlineCode(proposal.targetBranch)}`,
    "Full title:",
    codeBlock(proposal.title),
    "Full description:",
    codeBlock(proposal.description),
  );
  if (proposal.descriptionInput.kind === "file") {
    lines.push(`Description file: ${inlineCode(proposal.descriptionInput.path)}`);
  }
  lines.push("", "Exact commands:");
  for (const command of proposal.commands) {
    lines.push(`### ${command.action === "push" ? "Push" : "Create review request"}`, codeBlock(command.command, "bash"), "");
  }
  return lines.join("\n").trimEnd();
}

function inlineCode(value: string): string {
  const fence = "`".repeat(Math.max(1, longestBacktickRun(value) + 1));
  return `${fence}${value}${fence}`;
}

function codeBlock(value: string, language = "text"): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(value) + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map(([run]) => run.length));
}
