# Tasks JIRA-003 — Remove full local ADF schema validation

- **Specification:** [spec.md](spec.md), approved.
- **Plan:** [plan.md](plan.md), approved.
- **Status:** Draft — human approval pending.

Each task has one checkable outcome. Mark its checkbox only after its gate passes. No implementation starts before this task list is approved. No live Jira write is authorized.

## Task list

- [ ] **T01** — Replace full schema validation with the small local check and remove its dependencies and files.
  - Update `packages/jira-integration/src/domain/adf-validation.ts` and `test/description-domain.test.ts` for basic document/node structure, meaningful non-empty content, and unchanged copied values. Let Jira validate detailed node properties; retain server rejection tests.
  - Remove only the schema JSON, its two license files, `THIRD-PARTY-NOTICES.md`, Ajv dependencies, and schema-only package/compiler settings named in the plan. Update `package-lock.json` without unrelated upgrades.
  - Clean only the Jira package's generated output with its existing clean script, then rebuild so the old schema cannot remain in the published files.
  - Gate: `npm test -- --run packages/jira-integration/test/description-domain.test.ts packages/jira-integration/test/description-application.test.ts`; `npm run build --workspace @manuelstolze/pi-jira-integration`; check that source imports and Jira dependencies contain no schema validator.

- [ ] **T02** — Align current documentation and capability records with basic local checks and final Jira validation.
  - Update package `README.md`. Remove claims and links for bundled schema validation and its license files. Note the simpler validation in the existing unreleased Jira Changeset.
  - Add a short JIRA-003 pointer to JIRA-002's records without rewriting their historical requirements or test evidence. Keep accepted architecture decision text unchanged; no new architecture decision is needed for this implementation method.
  - Gate: Check specification section 4 against current documentation; verify links; confirm tool input/output contracts and approval rules remain unchanged; run `git diff --check`.

- [ ] **T03** — Verify the simplified package and record actual results.
  - Run package tests, workspace type checks, builds, and tests. Inspect the dry-run package list for absence of the removed schema and notices. Import the compiled validator and check a valid document and an empty document without schema files.
  - Record passed, failed, and unrun checks in `validation.md`. Keep live Jira checks unrun unless separately approved. Preserve unrelated user edits.
  - Gate: `npm test -- --run packages/jira-integration/test`; `npm run typecheck`; `npm run build`; `npm test`; `npm pack --workspace @manuelstolze/pi-jira-integration --dry-run --json`; compiled validator check; `git diff --check`.

## Acceptance coverage

- Basic structure, non-empty content, private copy, and rejection without conversion: T01.
- No full schema, Ajv dependencies, stale generated schema, or schema-only published notices: T01 and T03.
- Jira rejection without an automatic retry, plus unchanged approval/read/verification behavior: existing application and session tests in T01 and T03.
- Accurate current documentation and preserved historical records: T02.

## Delivery wording

- **Branch:** `refactor/jira-simplify-adf-validation`
- **Commit subject:** `♻️ refactor(jira-integration): simplify ADF validation`
- **Pull request title:** `♻️ refactor(jira-integration): simplify ADF validation`
- **Pull request summary:** Remove the full ADF schema and validator dependencies. Keep basic local structure/content checks and let Jira validate document details. Preserve approval and saved-value verification.

No branch, commit, implementation, or live Jira write was performed by creating this task list.
