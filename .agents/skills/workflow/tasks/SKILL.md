---
name: speckit-tasks
description: Break an approved code-change plan into implementation tasks.
---

# speckit tasks — Break a plan into testable tasks

Write `tasks.md` beside the approved `plan.md`, using
[`TASKS-TEMPLATE.md`](./TASKS-TEMPLATE.md).

Repository paths below are relative to the repository root unless given as Markdown links.

## Rules

- The human owner must approve `plan.md` first.
- Give each task one independently testable outcome. Use as many tasks as needed.
- Prefer tasks that deliver an outcome across the affected layers. When this is not practical,
  order contracts and types before domain logic and infrastructure.
- Keep the template's numbered Markdown checkboxes (`- [ ] **T01** — …`).
- Give each task a gate: a command or check that confirms its outcome.
- Include tasks to update affected capability specs, package glossaries and rule documents, public contracts, and
  architecture decision records (ADRs).
- Write the branch name, the commit subject and the pull request based on
  [`CONTRIBUTING`](../../../../CONTRIBUTING.md).

## Steps

1. Read `CONSTITUTION.md`, the approved `spec.md` and `plan.md`, `GLOSSARY-MAP.md`, the root and relevant package glossaries, `CONTRIBUTING.md`, and relevant package README files. Follow [domain documentation guidance](../../../../docs/agents/domain.md).
2. Read `TASKS-TEMPLATE.md` and use it to create the ordered task list.
3. Replace the template placeholders with the change reference, title, tasks, and checks.
4. Save `tasks.md` and present it for human approval. Begin implementation only after the human
   owner approves `spec.md`, `plan.md`, and `tasks.md`.
