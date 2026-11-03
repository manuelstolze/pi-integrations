---
id: JIRA-003
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
status: approved
owner: '@owner'
---

# Plan JIRA-003 — Remove full local ADF schema validation

- **Specification:** [spec.md](spec.md), approved.
- **Plan status:** Approved by the human owner in this conversation.
- No code changes until this plan and the task list are approved.

## 1. Small local check

Change only `packages/jira-integration/src/domain/adf-validation.ts` and its domain tests:

- Remove Ajv imports, schema imports, and schema compilation.
- Check that the root is an object with `type: "doc"`, `version: 1`, and a `content` array.
- Check basic node structure recursively: nodes are objects with a non-empty string `type`; present `content` values are arrays of nodes; text nodes contain string text.
- Keep the existing meaningful-content check so empty containers, whitespace, and line breaks cannot clear a description.
- Do not validate every node property, allowed nesting rule, or Jira-specific format. Jira makes that final check during the approved write.
- Preserve the document and return a private copy. Do not repair or remove content. Keep the existing exported validator function and all callers unchanged.

Update tests to reject basic structural errors locally and to allow documents whose detailed node properties must be checked by Jira. Retain the existing application test for Jira rejecting a submitted document without retry.

## 2. Remove schema-only files and dependencies

Remove only these files and their now-empty package directories:

- `src/domain/adf/full-schema.json`
- `LICENSES/atlassian-adf-schema.txt`
- `LICENSES/Apache-2.0.txt`
- `THIRD-PARTY-NOTICES.md`

Remove `ajv` and `ajv-draft-04` from the Jira workspace with npm. Update the root `package-lock.json`; do not change unrelated dependency versions or run audit fixes. No replacement dependency is added.

Remove the schema notice entries from package `files`. Remove `resolveJsonModule` and the JSON include from the package `tsconfig.json`. Keep the root compiler configuration and existing Pi compatibility unchanged.

Run the Jira package's existing clean script before rebuilding. This removes only its reproducible generated output and build metadata. A normal incremental build alone can leave the old schema in `dist`, where npm could still publish it. Do not hand-edit generated files or remove unrelated source files.

## 3. Documentation and contracts

Update package `README.md` to state that local checks cover basic structure and non-empty content, while Jira validates document details at submission. Remove links and claims about the bundled schema, offline schema validation, and schema license files.

Keep JIRA-002's specification, plan, and validation evidence as historical records. Add a short pointer to JIRA-003 for the changed validation rule; do not make old test results appear to describe the new implementation.

Keep accepted ADR decision text unchanged. This changes the local validation method, not approved fields, conversation approval, ACLI access, or verification. Use the existing unreleased Jira Changeset to note the simpler validation; do not add another version bump for the same unreleased feature.

No tool, approval, application workflow, global skill, or user configuration change is needed. No new architecture decision or runtime configuration is added.

## 4. Verification

After implementation:

```bash
npm test -- --run packages/jira-integration/test
npm run typecheck
npm run build
npm test
npm pack --workspace @manuelstolze/pi-jira-integration --dry-run --json
git diff --check
```

Check that source imports, Jira package dependencies, the lockfile's Jira workspace entry, and the published package list contain no schema validator or schema-only files. Other workspaces may retain a dependency if they independently need it.

Import the compiled validator and exercise a valid document and an empty document without schema files. Record passed, failed, and unrun checks. No live Jira write is needed or authorized.

## 5. Delivery wording

- **Branch:** `refactor/jira-simplify-adf-validation`
- **Commit subject:** `♻️ refactor(jira-integration): simplify ADF validation`
- **Pull request title:** `♻️ refactor(jira-integration): simplify ADF validation`
- **Pull request summary:** Remove the full ADF schema and validator dependencies. Keep basic local structure/content checks and let Jira validate document details. Preserve approval and saved-value verification.

No branch, commit, or pull request is created by this plan.
