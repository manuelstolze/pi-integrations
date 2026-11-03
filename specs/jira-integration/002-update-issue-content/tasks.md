# Tasks JIRA-002 — Update issue descriptions

- **Specification:** [spec.md](./spec.md), approved.
- **Plan:** [plan.md](./plan.md), approved.
- **Status:** Approved by the human owner in this conversation.
- **Architecture decision:** [ADR-0010](../../../docs/adr/0010-allow-approved-jira-description-updates.md), accepted.

Each task has one checkable outcome. Keep tests with the behavior they check. Mark a task complete only after its gate passes, and include the checkbox update in the task's commit when commits are made. No implementation task is complete merely because this file exists.

Do not change code until the owner approves this task list and ADR-0010. No task authorizes a live Jira write. Use fake Jira responses and fake command runners unless the owner approves an exact live test separately.

## Task list

- [x] **T01** — Record owner approval of the description-only architecture decision before implementation.
  - Files: `docs/adr/0010-allow-approved-jira-description-updates.md`, `docs/adr/README.md`, and only the relationship metadata in `docs/adr/0001-read-only-jira-access.md`.
  - After explicit approval, set ADR-0010 to `accepted`, record the actual approver, keep the index status consistent, and add `ADR-0010` to ADR-0001's `amended_by` metadata. Do not rewrite accepted decision text or mark unimplemented behavior as delivered.
  - Gate: Confirm owner approval in the conversation; verify accepted status and approver metadata; compare ADR-0001's decision text with its prior value; run `git diff --check`.

- [x] **T02** — Validate a complete, non-empty ADF replacement without changing its content.
  - Files: `packages/jira-integration/src/domain/description-update.ts`, `src/domain/adf-validation.ts`, `src/domain/adf/full-schema.json`, package-local schema source/license notices, `package.json`, `tsconfig.json`, root `package-lock.json`, and `test/description-domain.test.ts`.
  - ADF means Atlassian Document Format, Jira's structured JSON format for rich text. Copy the versioned schema and retain applicable notices. Add the approved Ajv JSON Schema validation dependencies and package-local JSON import support. Do not add a Pi TUI dependency.
  - Cover malformed documents, unsupported nodes, whitespace-only text, empty containers and tables, meaningful text and leaf content, multi-issue key rejection, input immutability, and structural comparison. Compare object keys without depending on their order; retain array order, marks, and all stored values.
  - Gate: `npm test -- --run packages/jira-integration/test/description-domain.test.ts`; `npm run typecheck`; verify schema source version/checksum and required license notices.

- [x] **T03** — Expose a complete description through the existing `jira_view` without changing default reads.
  - Files: `src/application/ports/jira-description-port.ts`, `src/application/use-cases/jira-tools.ts`, `src/infrastructure/jira-cli-adapter.ts`, `src/infrastructure/description-files.ts`, `src/interface/pi/register-jira-tools.ts`, and package tests.
  - Add optional `includeDescriptionDocument`, default `false`. Build normalized issue details and the complete raw description from one CLI response. Preserve the existing text `description` field and all default result fields. Support ADF objects, legacy strings, and explicit `null`; reject omitted or unreadable values on the opted-in path.
  - Provide the complete output in structured details and a private full-output file reference when model-facing text is shortened. Keep default output limits unchanged. Do not register another read tool.
  - Gate: `npm test -- --run packages/jira-integration/test/interface.test.ts packages/jira-integration/test/jira-client.test.ts packages/jira-integration/test/description-cli.test.ts`; confirm default and opted-in output fixtures and a complete document longer than current text limits.

- [x] **T04** — Prepare an immutable description proposal without writing to Jira.
  - Files: `src/application/ports/description-proposal-port.ts`, `src/application/use-cases/update-description.ts`, and `test/description-application.test.ts`.
  - Use the two approved capability interfaces for Jira and session proposals. Validate the replacement, read the authenticated target and complete description, and store a fixed proposal with a unique ID. Return a complete preview and `pending-approval` immediately. Never hold a tool call or queue open waiting for another user message.
  - Keep one pending proposal per conversation. A new prepare invalidates the previous pending proposal and unused approval. Block preparation on unknown current content or required record/publication failure.
  - Gate: `npm test -- --run packages/jira-integration/test/description-application.test.ts`; fake ports prove prepare performs zero writes, preserves exact values, returns without a user reply, and invalidates superseded proposals.

- [x] **T05** — Establish approval from an actual matching user reply after a completed proposal preview.
  - Files: `src/interface/pi/description-conversation-adapter.ts` and `test/description-conversation.test.ts`.
  - Observe Pi input events from `interactive` and `rpc`, preserve the normal conversation with `continue`, and record input source/text. Match `Approve Jira update <proposal-id>` with the approved case/whitespace normalization. Require a completed preview on the active branch and a subsequent matching persisted user message at apply time.
  - Reject bare yes, quoted phrases, premature or queued approvals that predate publication, agent arguments, extension-injected input, tool output, Jira text, and transformed/consumed input whose evidence cannot be matched. Implement `Cancel Jira update <proposal-id>` and revocation by later user input.
  - Gate: `npm test -- --run packages/jira-integration/test/description-conversation.test.ts`; tests must prove a proposal ID or approval flag alone cannot authorize a write.

- [x] **T06** — Preserve pending proposals across session continuation without restoring reusable approval.
  - Files: `src/interface/pi/description-conversation-adapter.ts` and `test/description-session.test.ts`.
  - Store full proposals and linked decision/attempt/outcome records through Pi session APIs. Rebuild only unattempted pending proposals from the active branch; require a fresh actual approval after resume or reload. Reject another session ID or forked session. Clear grants on tree navigation.
  - Track consumed/attempted IDs across the whole session so navigating to an earlier branch cannot repeat an external Jira change. Use all entries only for this consumed-ID check, not to choose the active pending proposal. Treat uncertain attempt history as requiring a new proposal and approval.
  - Gate: `npm test -- --run packages/jira-integration/test/description-session.test.ts`; cover reload, resume, tree changes, forked IDs, consumed proposals on abandoned branches, missing preview artifacts, and interrupted attempts.

- [x] **T07** — Submit exactly one description-only ACLI edit through a private payload file.
  - Files: `src/infrastructure/jira-cli-adapter.ts`, `src/infrastructure/description-files.ts`, and `test/description-cli.test.ts`.
  - Build only `issues: [oneKey]` and `description`. Run the approved argument-array command with `--from-json`, `--yes`, and `--json`; do not use a shell, another selector, another field, another write method, or an automatic retry.
  - Parse the actual active site/account from authentication status. Allow initial prepare authentication, but block apply on changed, missing, or ambiguous identity without logging in under old approval. Keep the existing timeout and credential redaction. Reject an already-aborted signal before process submission.
  - Create a directory with mode `0700` and file with mode `0600`. Clean payload files after process completion, including failure paths. Report cleanup errors without hiding the command outcome. Do not add a public write method to `JiraClient`.
  - Gate: `npm test -- --run packages/jira-integration/test/description-cli.test.ts`; fake-runner assertions cover exact payload/arguments, one invocation, permissions, no login after approval, safe errors, and cleanup. No live command runs in the test.

- [x] **T08** — Apply one saved proposal only after consuming its verified approval and checking for changes.
  - Files: `src/application/use-cases/update-description.ts` and `test/description-application.test.ts`.
  - Implement apply with only a proposal ID. Reject replacement content or approval flags on apply. Under a local apply queue, validate the active proposal and actual user evidence, record consumed state, re-read target identity and the complete description, and compare them with the approved snapshot.
  - Submit at most once. Block on conflict, target change, cancellation before submission, failed checks, failed recording, or consumed approval. Do not refresh approval or retry automatically. A fresh proposal is required after a stopped attempt.
  - Gate: `npm test -- --run packages/jira-integration/test/description-application.test.ts`; cover simultaneous apply calls and assert at most one write, plus zero writes for every blocked path.

- [x] **T09** — Verify the saved document and report rejected or uncertain outcomes without another write.
  - Files: `src/application/use-cases/update-description.ts`, `src/infrastructure/jira-cli-adapter.ts`, conversation record handling, and application/CLI tests.
  - After submission, perform a bounded same-target read-back when possible. Use an independent bounded signal if cancellation occurred after submission. Classify the saved document as matching the proposal, unchanged, different, or unknown. Keep command errors separate from saved-state evidence.
  - Cover Jira permission rejection, schema-valid ADF rejected by Jira, server document changes, timeout, cancellation, unreadable response, verification failure, and record failure after submission. Never claim that nothing changed without evidence. Never retry or restore automatically.
  - Gate: `npm test -- --run packages/jira-integration/test/description-application.test.ts packages/jira-integration/test/description-cli.test.ts`; verify saved-document comparison detects formatting differences even when plain text matches.

- [x] **T10** — Connect the prepare/approve/apply workflow through one new Pi tool.
  - Files: `src/interface/pi/register-description-update-tool.ts`, `src/index.ts`, relevant conversation lifecycle handlers, `test/description-interface.test.ts`, and `test/index.test.ts`.
  - Register `jira_update_description` with strict prepare/apply input shapes. Keep a total of four Jira tools: three existing tools plus this update tool. Reject extra fields and approval claims at the interface and application boundaries.
  - Publish the exact preview and explicit approval/cancel reply in the conversation. Return a private complete-preview path when output needs shortening, but keep immutable proposal data independent of that file. Connect source checks, consumed approval, apply, verification, and safe results. Do not call UI dialogs or check the Pi mode to allow writes.
  - Gate: `npm test -- --run packages/jira-integration/test/description-interface.test.ts packages/jira-integration/test/index.test.ts packages/jira-integration/test/interface.test.ts`; assert no separate description read tool or Pi TUI import, no custom screen, and unchanged original tool contracts.

- [x] **T11** — Verify conversation approval across Pi modes with fake Jira access.
  - Files: `test/description-session.test.ts` and Pi integration test fixtures under the package test directory.
  - Use actual Pi session/input ordering with fake Jira ports to check prepare, completed preview, matching user reply, and apply. Check terminal and RPC input paths. Check JSON/print preparation followed by approval in a resumed saved session. One-shot unapproved runs must never write.
  - Verify user replies are not blocked by a running prepare call, temporary preview cleanup does not destroy the persisted proposal, and transformed input does not accidentally become approval. Keep all test sessions and files private and temporary.
  - Gate: `npm test -- --run packages/jira-integration/test/description-session.test.ts`; no network, credentials, or live Jira issue is required. Report any unsupported Pi event ordering rather than weakening approval checks.

- [x] **T12** — Update the delivered capability documentation and context contracts.
  - Files: package `README.md`, `skills/jira-integration/SKILL.md`, and root `README.md`. Update relevant `GLOSSARY.md` files and root `GLOSSARY-MAP.md` only if terms or context relationships change. Update JIRA-002 delivery notes only to record implementation evidence, not to change approved requirements.
  - Document optional complete reads, non-empty ADF, description-only writes, prepare/explicit conversation approval/apply, all-mode rules, Jira permission enforcement, temporary output lifetime, exact comparison, failure outcomes, and concurrency limits. Keep acceptance criteria unchanged. Do not prescribe a shell fallback for blocked writes.
  - Use the writing-for-agents skill before editing the package skill. Keep the glossary unchanged unless an actual domain term changes. Do not edit global Jira authoring skills. Preserve unrelated user edits in root documents.
  - Gate: Read examples against the implemented tool schemas; verify all capability deltas in specification section 4 are represented; check links and run `git diff --check`. Do not use the template's `pnpm spec:validate`: this repository has no such script.

- [x] **T13** — Verify package contents and record the minor release change.
  - Files: package `package.json`, applicable license/source notice files, and a new package Changeset under `.changeset/`. Keep root `package-lock.json` consistent with approved dependencies.
  - Include the compiled schema and its required notices in the package. Update the read-only package description. Add a minor-version Changeset for `@manuelstolze/pi-jira-integration`. Keep Pi compatibility unchanged and do not add a review UI dependency.
  - Gate: `npm run build --workspace @manuelstolze/pi-jira-integration`; `npm pack --workspace @manuelstolze/pi-jira-integration --dry-run --json`; verify an offline import of the compiled validator and the listed schema/license files; check the Changeset package name and minor release type.

- [x] **T14** — Run final acceptance checks and record passed, failed, and unrun validation.
  - Review the acceptance mapping below against concrete test names. Check inward imports, public exports, default reads, one-use approval, and lack of unintended field writes. Record results in the delivery/PR notes without changing approved scope.
  - Gate: `npm test -- --run packages/jira-integration/test`; `npm run typecheck`; `npm run build`; `npm test`; `git diff --check`. The package-content gate from T13 must also pass.
  - Manually inspect the conversation preview and approval/cancel flow on the minimum supported Pi version with fake Jira access where practical. A successful live description-only write is not yet verified. Ask separately for approval of its exact target/content if a live check is needed. Otherwise report it as unrun; do not use D3X-25630 or remove/restore content under the old test approval.

## Acceptance coverage

Each acceptance criterion must have a concrete automated test before its implementation task is complete.

| Specification criterion | Primary tasks | Required test outcome |
| --- | --- | --- |
| AC-001 | T07, T08, T09, T10 | Approved valid replacement changes only the description once and is verified. |
| AC-002 | T02, T08, T10 | Extra fields, multiple issues, and selectors cause zero writes; no mapping is needed. |
| AC-003 | T02, T04 | Clears, empty containers, and whitespace replacements are rejected. |
| AC-004 | T02, T04 | Plain text and invalid ADF replacements are rejected without conversion. |
| AC-005 | T03, T04 | Known empty content can be replaced; omitted or unreadable current content blocks preparation. |
| AC-006 | T03, T04, T10 | Full original and proposed values stay inspectable beyond normal text limits. |
| AC-007 | T05, T10, T11 | Actual later user approval is required; injected claims and mode-only restrictions do not grant or deny permission. |
| AC-008 | T04, T06, T08 | Changed proposals need new approval; consumed approval cannot be replayed. |
| AC-009 | T08 | Changed descriptions or failed final checks cause zero writes and require a new proposal. |
| AC-010 | T07, T09 | Jira permission errors are reported without bypass or separate permission proof. |
| AC-011 | T07, T09 | Jira rejection is reported without conversion or another submission. |
| AC-012 | T02, T09 | Structural mismatches and unreadable saved values never become false success. |
| AC-013 | T09 | Timeout/cancellation after submission triggers bounded read-only verification or an explicit unknown result. |
| AC-014 | T05, T06, T09, T10 | The session records exact proposal, actual approval evidence, attempt, and result without credentials or another audit log. |
| AC-015 | T03, T10, T14 | Default reads stay compatible; opted-in view returns the complete document; no separate read tool is added. |

## Delivery wording

- **Branch:** `feat/jira-update-issue-content`
- **Commit subject:** `✨ feat(jira-integration): add approved description updates`
- **Pull request title:** `✨ feat(jira-integration): add approved description updates`
- **Pull request summary:** Extend `jira_view` with optional complete document access and add one description update tool. Prepare a fixed non-empty ADF replacement, obtain explicit user approval in the conversation, apply it once through ACLI, and verify the saved value. Keep other fields and default reads unchanged.

Implementation and automated task gates are complete. See [validation.md](validation.md) for command results, concrete test coverage, existing audit findings, and unrun manual/live checks. No branch, commit, pull request, or new live Jira write was performed.
