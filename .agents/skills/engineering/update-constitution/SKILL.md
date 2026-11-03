---
name: update-constitution
description: Govern changes to mandatory engineering rules. Use when the owner requests a constitution change or a proposed decision conflicts with the constitution.
---

# Update constitution

Update `CONSTITUTION.md` only after the human owner approves the proposed
rule change. This skill governs mandatory engineering rules. It is not a feature delivery
step and does not grant an exception for feature work.

Repository paths below are relative to the repository root.

## Process

1. Read the current constitution. Identify the proposed change and the guidance that depends
   on the affected rule. Check `AGENTS.md`, relevant context files, documentation, and skills.
   Check templates only if they exist.
2. Present the proposed rule change, its reason, the version increase, and the affected files.
   Explain how the change affects existing work. Obtain explicit owner approval before
   editing the constitution or dependent guidance. If the owner declines, leave them unchanged.
3. Apply only the approved change. Preserve the constitution's heading structure. Set its
   version using the rules below. Prepend a Sync Impact Report with the old and new versions,
   changed rules, affected guidance, and any open follow-up work. Keep earlier reports.
4. Update affected guidance that exists. Add a new document only when the approved change
   needs it. Keep the constitution as the source of mandatory rules; use references instead
   of copying those rules into dependent skills.
5. If an architecture decision changes, read `docs/adr/README.md` and follow its process for
   architecture decision records (ADRs). Use `domain-modeling` when terms or the domain model
   also need to change. Preserve accepted decisions; record a changed decision in a new ADR.
6. Check that the version, report, references, and dependent guidance agree. Search for stale
   references to changed rules. Report checks, changed files, and open points. If further rule
   changes are needed, obtain approval before applying them.
7. Present the completed changes and obtain separate owner approval before committing.
   Approval to edit is not approval to commit.

## Version rules

Use `MAJOR.MINOR.PATCH`. If the constitution has no version, propose `1.0.0` for the
first constitution update. Obtain explicit owner approval before setting it. In the Sync
Impact Report, record the old version as `unversioned` and the new version as `1.0.0`.

For later updates, select the highest applicable increase:

| Increase | Change | Example |
| --- | --- | --- |
| Major | Remove or change an existing principle. | `1.2.3` → `2.0.0` |
| Minor | Add a principle or extend guidance without changing an existing principle. | `1.2.3` → `1.3.0` |
| Patch | Clarify wording without changing meaning. | `1.2.3` → `1.2.4` |

Reset lower version numbers to zero after a major or minor increase. If no rule or wording
changes, leave the version unchanged. Include the version choice in the approval request.
