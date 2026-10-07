---
name: speckit-tasks
description: Break an approved code-change plan into implementation tasks.
---

# speckit-tasks — Break a plan into atomic tasks

Write `tasks.md` for an approved `plan.md`.

## Rules

- Read and follow `.specify/memory/constitution.md` before writing tasks.
- The human owner must approve `plan.md` first.
- Produce atomic, independently testable tasks; do not impose an artificial task-count limit.
- Prefer vertical slices that deliver a testable outcome across the affected layers. Use a
  contract-only or infrastructure-only task when a vertical slice is not meaningful.
- Order contracts/types before domain logic and infrastructure when the work cannot be sliced
  vertically.
- Give every task an acceptance gate.
- Write each task as a Markdown checkbox item (`- [ ] **T01** — …`), numbered and ordered. The
  checkbox is how a reader — human or agent — sees at a glance what is already done, so it must
  survive into `tasks.md` and not be flattened into headings.
- If the change affects a package context, public contract, or ADR, include a task to update it in
  the same change.
- Write the branch name, the commit subject and the pull request based on
  [`CONTRIBUTING`](../../../../CONTRIBUTING.md).

## Steps

1. Read the approved plan, `.specify/memory/constitution.md`, and the relevant package context.
2. Split the work into small, testable tasks.
3. Save `tasks.md`.
4. Begin implementation only after the human owner approves `spec.md`, `plan.md`, and `tasks.md`.
