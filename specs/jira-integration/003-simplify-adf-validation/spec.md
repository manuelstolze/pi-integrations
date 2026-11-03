---
id: JIRA-003
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
status: approved
owner: '@owner'
---

# Spec JIRA-003 — jira-integration: Remove full local ADF schema validation

- **Status:** Approved by the human owner in this conversation.
- **Related change:** [JIRA-002](../002-update-issue-content/spec.md).

## 1. Problem / intent (WHY)

Full local validation of Atlassian Document Format (ADF), Jira's rich-text JSON format, adds unnecessary dependencies and package data. The owner requested their removal. Keep a small local check and let Jira validate supported document details during the approved write.

## 2. Scope

- **In scope:** Remove the full ADF schema, Ajv validation libraries, schema-only license/source files, and schema-only build settings. Update affected tests and documentation.
- **Out of scope:** Changes to tools, user approval, issue fields, clearing, ACLI access, change checks, retries, or saved-value verification. Do not remove unrelated license files or dependencies.

## 3. Requirements (WHAT)

- **FR-001:** The package MUST NOT include or load a full external ADF schema or depend on `ajv` or `ajv-draft-04` for description validation.
- **FR-002:** Local checks MUST require an ADF document root with `type: "doc"`, `version: 1`, and a `content` array. Reject plain text, an invalid basic structure, and empty or whitespace-only content. Keep valid content unchanged.
- **FR-003:** Jira MUST perform the final validation of supported node details and formatting during submission. A document can pass local checks and still be rejected by Jira. Report that error without conversion or an automatic retry.
- **FR-004:** Existing user approval, fixed proposals, single-attempt rules, target and description checks, credential protection, and complete saved-document comparison MUST remain unchanged.
- **FR-005:** Remove only schema-specific dependencies, files, settings, and published-package references. Keep the package lock consistent. Documentation and tests MUST distinguish basic local checks from Jira's final validation.

## 4. Capability deltas

- **Modified — Description input checks:** The integration checks basic structure and non-empty content locally. Jira validates full document support when the approved update is submitted.
- **Removed — Full local schema validation:** No schema download, bundled schema, or schema-validator libraries are required.
- **Unchanged:** Description-only updates, complete reads, explicit conversation approval, ACLI-only access, and read-back verification.

## 5. Acceptance criteria

- A non-empty document with the required basic structure passes local checks without content changes.
- Plain text, invalid roots, invalid basic content structure, empty containers, and whitespace-only replacements are rejected locally.
- Local checks do not claim to validate every node property or Jira-specific formatting rule. A later Jira rejection is reported without a retry.
- Package dependencies and published contents contain no full ADF schema, Ajv validators, or schema-only notices.
- Existing approval, conflict, cancellation, read, and verification tests continue to pass.

## 6. Domain notes

This replaces JIRA-002's requirement for full local document validation before writing. It does not weaken user approval or bypass Jira permissions. Existing accepted architecture decision text remains unchanged; implementation details and current documentation must state where validation occurs.

## 7. Events / API contracts

No tool names or input shapes change. Some detailed document errors will be reported by Jira after an approved submission instead of by a local schema validator before preparation. ADF remains the replacement format.

## 8. Open questions

None. The owner explicitly requested removal of the full schema and its overhead.

## 9. Delivery notes

- **Affected package:** `packages/jira-integration`; root dependency lock; related change documentation.
- **Branch:** `refactor/jira-simplify-adf-validation`
- **Commit subject:** `♻️ refactor(jira-integration): simplify ADF validation`
- **Pull request title:** `♻️ refactor(jira-integration): simplify ADF validation`
- **Pull request summary:** Remove the full local ADF schema and validator dependencies. Keep basic structure and non-empty checks, user approval, and saved-value verification. Let Jira validate document details.
- No new live Jira test is authorized by this change.
