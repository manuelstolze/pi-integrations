<!--
Sync Impact Report
Version: 1.1.0
Change: Aligned the constitution with pi-integrations, kept the approved spec-first gate for every code change, and added the English-only artifact rule.
Propagation: AGENTS.md now requires this constitution before every task and sets its precedence. Speckit workflows now apply the spec-first gate to all code changes and use repository context files.
-->

# Engineering Constitution

> This constitution defines mandatory engineering rules for the `pi-integrations` repository.
> `AGENTS.md` requires every agent to read it before each task.

---

## Non-negotiable principles

### Architecture

1. Keep each extension's source, tests, and package documentation inside its package.
2. Respect package boundaries, contracts, and rules in the repository and package context files.
   Read relevant context files and architecture decision records before changing a documented
   boundary or decision.
3. Keep accepted architecture decisions unchanged. Use the process in `docs/adr/README.md` to
   record a new or changed decision.

### Delivery and verification

1. **Spec-first.** Do not change code until the human owner approves `spec.md`, `plan.md`, and
   `tasks.md`. This applies to every code change, including features, bug fixes, refactors, and
   test changes.
2. **Get approval before irreversible actions.** Ask the human owner before an action that cannot
   be reversed.
3. **Run checks and report results.** Run the relevant checks for a change. State which checks
   passed, failed, or were not run. Passing checks do not prove that a change is correct.
4. **Respect guardrails.** Follow package boundaries, contracts, access controls, and required
   checks. If a change needs to bypass a guardrail, stop and ask the human owner before writing
   code.
5. **Do not add undocumented workarounds.** If the proper solution is blocked, stop and ask the
   human owner. If the owner approves an exception or temporary workaround, record the reason and,
   when temporary, the removal plan in the spec or an ADR.

---

## Communication patterns

- Use English for all repository artifacts, including code, documentation, specifications, commit
  messages, event names, and domain identifiers.
- State assumptions and open points clearly. Report commands and check results accurately.
