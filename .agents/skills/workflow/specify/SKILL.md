---
name: speckit-specify
description: Write the approved specification required before every code change.
---

# speckit specify — Write a code-change spec

Write `specs/<domain>/<id>-<slug>/spec.md` for every code change, including features, bug fixes, refactors, and test changes.

## Rules

- Read `.specify/memory/constitution.md`, `CONTEXT-MAP.md`, and the relevant package context first.
- Define WHAT, never HOW.
- Do not write implementation code until the human owner approves the spec, plan, and tasks.
- Write the branch name, the commit subject and the pull request based on
  [`CONTRIBUTING`](../../../../CONTRIBUTING.md).


## Required workflow

1. Ask the human owner for the intended code change and desired result.
2. Identify load-bearing unknowns and ask targeted questions about them.
3. Once open questions are resolved, integrate the answers directly into `spec.md` and delete the
   open (now resolved) questions.
4. Describe affected capability deltas in `## 4. Capability deltas`, using `Added`, `Modified`,
   or `Removed` requirement entries, or an explicit `None` statement.
5. Present the completed spec for human approval before running `speckit-plan`.

## Spec structure

The front matter identifies the change, affected package or repository area, status, and owner.
Add domain, service, or product fields only when they apply. The body describes the problem, scope,
requirements, capability deltas, acceptance criteria, relevant domain rules and contracts, and only
genuinely unresolved questions.
