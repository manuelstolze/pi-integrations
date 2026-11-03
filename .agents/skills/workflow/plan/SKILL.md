---
name: speckit-plan
description: Write the technical plan for an approved code-change specification.
---

# speckit plan — Write a technical plan

Write `plan.md` for an approved code-change `spec.md`.

Repository paths below are relative to the repository root unless given as Markdown links.

## Rules

- Read and follow `CONSTITUTION.md` before planning.
- The human owner must approve `spec.md` first.
- Define HOW: affected packages, modules, contracts, dependencies, and test strategy.
- Name affected packages, modules, or repository areas. State whether their glossaries, rule documents, or
  public contracts need updates.
- Respect package, module and layer boundaries.
- Write the branch name, the commit subject and the pull request based on
  [`CONTRIBUTING`](../../../../CONTRIBUTING.md).

## Steps

1. Read the approved `spec.md`, `GLOSSARY-MAP.md`, the root and relevant package glossaries, `CONTRIBUTING.md`, and relevant package README files. Follow [domain documentation guidance](../../../../docs/agents/domain.md).
2. Identify affected packages, modules, contracts, and any required migrations.
3. Define the test and acceptance gates.
4. Save `plan.md` and present it for human approval before `speckit-tasks`. Do not begin implementation until the human owner approves `spec.md`, `plan.md`, and `tasks.md`.
