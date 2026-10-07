---
name: speckit-constitution
description: Govern approved updates to the project constitution.
---

# speckit-constitution — Governance skill

This is a governance skill, not a step in the per-feature workflow. It updates
`.specify/memory/constitution.md` only when the human owner decides that a non-negotiable
principle must change.

## Rules

- Never use this skill to bypass a principle for feature work.
- Read the current constitution and preserve its heading structure.
- Apply the appropriate semantic version bump and prepend a sync impact report.
- Propagate affected guidance to `AGENTS.md` and dependent skills.
- Obtain human approval before committing the constitution change.
