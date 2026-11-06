---
name: speckit-specify
description: Write the approved specification required before every code change.
---

# speckit specify — Write a code-change spec

For every code change, prepare the specification in Headquarter under `specs/pi-integrations/<change-slug>/spec.md`. Locate the Headquarter repository and follow its `.agents/skills/workflow/specify/SKILL.md`. If its location is unknown, ask the owner.

Repository paths below are relative to the repository root unless given as Markdown links.

## Rules

- Read `CONSTITUTION.md`, `GLOSSARY-MAP.md`, the root and relevant package glossaries, `CONTRIBUTING.md`, and the relevant package README first. Follow [domain documentation guidance](../../../../docs/agents/domain.md).
- Define WHAT, never HOW.
- Use the Headquarter specification template and approval process.
- Record the human owner's approval using the Headquarter approval process.
- Do not write implementation code until the human owner approves the spec, plan, and tasks.
- Write the branch name, the commit subject and the pull request based on
  [`CONTRIBUTING`](../../../../CONTRIBUTING.md).

## Required workflow

1. Ask the human owner for the intended code change and desired result.
2. Identify load-bearing unknowns and ask targeted questions about them.
3. Once open questions are resolved, integrate the answers directly into `spec.md` and delete the
   open (now resolved) questions.
4. Describe affected capability changes using `Added`, `Modified`, or `Removed` entries, or an explicit `None` statement.
5. Present the completed spec for human approval before running `speckit-plan`.

## Spec structure

Use the Headquarter template. Identify the affected package or repository area, and describe capability changes, relevant domain rules, and contracts. Include only genuinely unresolved questions.
