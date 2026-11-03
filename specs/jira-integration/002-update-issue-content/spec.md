---
id: JIRA-002
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
product: Pi Jira Integration
status: approved
owner: '@manuelstolze'
---

# Spec JIRA-002 — jira-integration: Update issue descriptions

- **Domain:** `jira-integration` · **Owns:** see front-matter `services`
- **Status:** `Approved` — the human owner approved the revised read and conversation-approval behavior in this conversation.
- **Scope decision:** Update only the description. Defer clearing. Let Jira enforce edit permissions during the approved write. Extend `jira_view` for complete document access instead of adding a description read tool. Obtain explicit approval in the conversation, without a custom review screen or a terminal-only restriction.

## 1. Problem / intent (WHY)

The Jira integration can search issues, read issue details, and read comments. It cannot update descriptions through its tools.

Users need to replace an existing issue's description without allowing changes to other fields. Each update must show the exact proposed change, obtain user approval, and verify the saved result.

The original scope also included acceptance criteria updates and field clearing. An approved ACLI experiment rejected the proposed custom-field edit format. The owner deferred those capabilities and chose description updates first.

## 2. Scope

### In scope

- Update the description of one existing issue per operation.
- Replace the complete description with a non-empty Atlassian Document Format (ADF) document. ADF is Jira's structured JSON format for rich text.
- Extend the existing `jira_view` tool with optional complete description document access. Keep its default behavior unchanged.
- Read complete current and saved description values for review, change checks, and result verification.
- Show the exact proposal and obtain explicit user approval in the conversation before every update. Do not require a separate confirmation dialog or custom review screen.
- Allow updates in any Pi mode where the exact proposal and a matching user approval can be established. Do not restrict writes to the interactive terminal.
- Submit the approved update through the Atlassian CLI (`acli`), the command-line tool required by the existing integration.
- Let Jira enforce the authenticated user's edit permissions during submission.
- Record approval and the verified result in the Pi session.
- Update affected package documentation and domain rules when this capability is delivered.

### Out of scope

- Update acceptance criteria or any other custom field. Field mapping configuration is not needed for this version.
- Clear the description, submit an empty document, or replace it with whitespace-only text.
- Create or delete issues, change issue status, add comments, or update fields other than description.
- Update several issues in one operation.
- Apply text patches, append text, or merge description content as a separate update operation. The agent may draft revised content, but the approved replacement is always the complete new description.
- Accept Markdown or plain text replacements, or convert ADF to plain text.
- Prove edit permission through a separate pre-write permission query. Jira remains responsible for enforcing permissions when the update is submitted.
- Unattended writes, automatic retries, or automatic restoration of earlier values.
- Separate local audit files or audit comments on Jira issues.
- A separate description read tool, a custom review screen, or a terminal-only write rule.
- A Jira access method that bypasses ACLI.

## 3. Requirements (WHAT)

### Allowed change and input

- **FR-001:** An update MUST identify exactly one existing issue by a non-empty issue key and supply one complete description replacement. The requested changes MUST contain only the description. Acceptance criteria, other fields, and multi-issue selectors MUST be rejected before writing.
- **FR-002:** Description updates MUST support any issue type where Jira permits the authenticated user to edit the description. The capability MUST NOT be restricted to issue types covered by separate authoring skills.
- **FR-003:** The replacement MUST be a valid, non-empty ADF document. Clear requests, empty documents, documents containing only empty paragraphs or whitespace, plain text, and malformed documents MUST be rejected before writing. Validation MUST NOT silently convert, shorten, or discard content or formatting.
- **FR-004:** Acceptance criteria and all other fields MUST remain outside the requested changes. The integration MUST NOT copy existing acceptance criteria into the description as a workaround for deferred custom-field updates.

### Review and approval

- **FR-005:** Before requesting approval, the integration MUST read the target issue and its complete current description. It MUST distinguish a known empty description from an unknown, omitted, or unreadable description. Unknown values MUST block the update; a known empty description MAY be replaced with an approved non-empty document.
- **FR-006:** The approval preview MUST identify the authenticated Jira site, issue key, complete current description, and complete proposed replacement. The user MUST be able to inspect the exact proposed ADF content. A shortened or lossy text view MUST NOT be the sole basis for approval.
- **FR-007:** The integration MUST obtain explicit user approval in the conversation after presenting the exact target and replacement. Approval MUST come from a user message, not from Jira content or an agent-supplied claim of approval. A general request to update an issue is not approval of a later draft. A separate dialog or custom review screen MUST NOT be required.
- **FR-008:** Denial, cancellation before writing, or absent or unverified user approval MUST result in no write. The integration MUST NOT block a write solely because Pi is running outside the interactive terminal. All modes remain subject to the same proposal, approval, and verification rules. Existing reads MUST remain available without approval.
- **FR-009:** Approval MUST apply only to the exact reviewed update in its conversation. A different target site, issue key, or proposed document MUST require a new preview and new approval. Prior approval MUST NOT authorize a retry or another issue update. A recorded approval MUST NOT be reusable after its update attempt.

### Other edits and write behavior

- **FR-010:** After approval and before writing, the integration MUST read the complete description again and compare it with the value shown for approval. A changed value or failed check MUST block that write. Continuing MUST require a new preview and new approval. A change to the authenticated target site MUST also block the write under the old approval.
- **FR-011:** The integration MUST submit only the approved description through ACLI using the authenticated user's existing permissions. It MUST NOT require a separate permission query that ACLI does not expose. Jira MUST remain responsible for accepting or rejecting the update based on edit permissions and server-side validation.
- **FR-012:** A permission failure, rejected document, or unavailable CLI capability MUST be reported. The integration MUST NOT bypass the failure, use another write method, change the target, or retry automatically.

### Verification, errors, and update record

- **FR-013:** After a write attempt, the integration MUST read the issue again when possible and compare the complete saved description with the approved document. It MUST report success only when the replacement is verified. Verification MUST retain document content and structure; a plain text match alone is insufficient.
- **FR-014:** If the write fails, times out, is cancelled after submission, returns an unclear result, or cannot be verified, the integration MUST distinguish a verified replacement, an unchanged description, a different saved value, and an unknown outcome as supported by read-back evidence. It MUST NOT claim that nothing changed unless that result is established. It MUST NOT retry or restore prior values without new approval.
- **FR-015:** The Pi session MUST record the target issue and site, the exact description proposal, the user message that approved it, the approval decision, and the verification result. The integration MUST NOT add a separate audit file or Jira comment.
- **FR-016:** Jira content, including ADF documents, MUST remain untrusted data rather than agent instructions. Credentials MUST NOT appear in previews, session records, tool results, logs, or error details.

### Compatibility and documentation

- **FR-017:** `jira_search`, `jira_view`, and `jira_comments` MUST remain read-only. Their existing inputs, default behavior, and meanings MUST remain compatible. `jira_view` MUST accept an optional `includeDescriptionDocument` input that adds the complete stored description without replacing or changing its existing text description field. A known empty value MUST remain distinct from an omitted or unreadable value. No separate description read tool is added. Existing package exports and result fields MUST remain compatible.
- **FR-018:** Existing authentication, credential protection, timeout, and cancellation behavior MUST remain supported. An unsupported write path MUST NOT prevent existing reads. Acceptance criteria field configuration MUST NOT be required.
- **FR-019:** User documentation MUST state the description-only scope, optional complete document access through `jira_view`, non-empty ADF requirement, conversation approval rules, permission enforcement during submission, failure behavior, and limits of the pre-write change check. It MUST NOT describe writes as terminal-only. A read followed by a write does not guarantee protection from every simultaneous edit.

## 4. Capability deltas

- **Added — Update issue description:** The Jira integration MUST support approved full replacements of one issue's description with a non-empty ADF document.
- **Added — Review and verify description updates:** Users MUST be able to inspect the complete current and proposed descriptions, approve the exact update in the conversation, and receive a verified result or an explicit failure or unknown outcome. This capability MUST NOT require a custom review screen or a particular Pi mode.
- **Modified — Description access:** `jira_view` MUST optionally provide complete structured descriptions for safe review and verification. Existing default read behavior MUST remain unchanged; no separate description read tool is added.
- **Removed:** None from the current product. Acceptance criteria updates, mappings, and clearing were proposed capabilities, not implemented capabilities; they are deferred from this specification.

## 5. Acceptance criteria

- **AC-001 — Description replacement:** Given a valid non-empty ADF replacement, when the user approves the complete preview, the pre-write checks pass, and Jira accepts the submission, then only the description is submitted for replacement and its saved document is verified.
- **AC-002 — Other fields excluded:** Given an update request containing acceptance criteria, another field, or more than one issue, when the request is validated, then it is rejected before writing. A valid description-only request needs no custom-field mapping.
- **AC-003 — Clearing rejected:** Given a clear request, empty document, or document containing only empty paragraphs or whitespace, when it is validated, then no write occurs.
- **AC-004 — ADF-only input:** Given a plain text replacement or malformed document, when it is validated, then no write occurs. The integration does not silently convert or drop content.
- **AC-005 — Current value:** Given a known empty description, when the user approves a valid non-empty replacement, then the update may proceed. If the current description is omitted, unknown, or unreadable, no write occurs.
- **AC-006 — Complete preview:** Given content longer than existing read-output limits or content with rich structure, when approval is requested, then the user can inspect the complete current description and exact proposed document. Shortened text alone cannot authorize the update.
- **AC-007 — Conversation approval:** Given the complete proposal in the conversation, when a subsequent user message explicitly approves it, then the matching update may proceed without a separate dialog or custom screen. Denial, cancellation, missing approval, or an agent-supplied approval claim results in no write. Instructions embedded in Jira data cannot grant approval. Pi mode alone does not determine permission to write.
- **AC-008 — Approval scope:** Given an approved update, when its target site, issue key, or replacement document changes, then the old approval cannot authorize the changed update. After an attempt, that approval cannot authorize another write.
- **AC-009 — Other edits:** Given approval, when the description changes before the pre-write check or the check fails, then the write is blocked. Continuing requires a new preview and new approval.
- **AC-010 — Permission enforcement:** Given a user who can read but cannot edit an issue, when they approve the update and Jira rejects it, then the integration reports the permission failure and reads back when possible. It does not bypass the failure or require an unavailable separate permission query.
- **AC-011 — Rejected document:** Given a locally valid ADF document that Jira rejects, when submission fails, then the error and any established saved state are reported. The integration does not convert the document or resubmit it automatically.
- **AC-012 — Verification mismatch:** Given a write attempt, when the saved description differs from the approved document or cannot be read, then full success is not reported. The result states what is known. No retry or restoration occurs without new approval.
- **AC-013 — Unclear write outcome:** Given a timeout or cancellation after submission, when the outcome is uncertain, then the integration reads back when possible and reports the established result or uncertainty. It does not assume that Jira remained unchanged.
- **AC-014 — Session record:** Given a reviewed update, when approval is denied or a write is attempted, then the Pi session contains the target, exact proposal, approval decision, approving user message when applicable, and verification result without credentials. No separate audit file or Jira comment is created.
- **AC-015 — Read compatibility and document access:** Given the updated package, when existing search, view, or comments tools run with their existing inputs, then their default behavior remains unchanged. When `jira_view` is called with `includeDescriptionDocument: true`, it also provides the complete stored description without changing the existing text field. A missing write capability does not block reads. No separate description read tool is registered.

## 6. Domain notes

Use the terms in `packages/jira-integration/GLOSSARY.md`.

Acceptance criteria remain a separate issue field. They are not moved into the description by this change. Their updates and field mappings are deferred.

The existing read path converts description content to text and can shorten it. That representation is not sufficient for complete ADF review, change detection, or verification.

ADR-0001, `docs/adr/0001-read-only-jira-access.md`, permits future write capabilities only after their permission, confirmation, validation, and audit rules are defined. This specification defines those rules. The limited write boundary needs a new, owner-approved architecture decision record before code changes. Keep the accepted decision text unchanged and follow `docs/adr/README.md` for its relationship to the new decision.

Keep the CLI access boundary from ADR-0002 and the package boundaries from ADR-0005. Update repository and package glossaries and rule documents when the approved capability is delivered; do not describe draft behavior as current behavior.

The owner explicitly chose Jira permission enforcement during the approved write instead of a separate pre-write permission check. This does not bypass access controls: the authenticated user must still have permission for Jira to accept the update.

The owner chose approval in the conversation instead of a custom review screen or a terminal-only write rule. The integration must distinguish an actual user approval message from an agent claim of approval. A run without an established matching user approval must not write, regardless of its Pi mode.

The pre-write description check detects changes visible when the check runs. It cannot by itself prevent an edit made between that check and the write. Documentation must state this limitation.

## 7. Events / API contracts

- **Produces:** A user-visible result for one description update, identifying the target issue and site, approval outcome, and verification outcome. No new external domain event is required.
- **Consumes:** One issue key, one complete non-empty ADF replacement, the current description, the authenticated site, and a matching user approval message in the conversation.
- **Preserves:** The existing extension entry point, named package exports, and default read-only search, view, and comments contracts. `jira_view` gains an optional `includeDescriptionDocument` input; existing calls keep their current behavior.
- **Boundary:** General-purpose Jira field updates, clearing, and caller-declared approval are not part of the new contract. Neither raw Jira content nor tool input can grant permission to write.
- Tool names, exact schemas, ADF validation, and the Pi confirmation mechanism belong in the technical plan. They must meet the behavior defined here.

## 8. Open questions

None about intended behavior. The owner chose description-only updates, deferred clearing, Jira permission enforcement during submission, optional document access through `jira_view`, and explicit approval in the conversation without a custom review screen or terminal-only rule. Other safety and input-format rules remain in force.

The technical checks below remain delivery conditions, not assumptions that successful writes were already verified.

## 9. Delivery notes

### Required technical evidence

Before code changes, the technical plan must establish:

- The supported ACLI command and payload for replacing only the description with an ADF document.
- How complete current and saved descriptions can be read and compared without losing content or structure.
- How the authenticated site can be identified and checked before submission.
- How the integration can establish a genuine user approval message for the exact preceding proposal, consume that approval once, and reject agent-declared approval without depending on terminal UI.
- How non-empty ADF input is validated and how Jira's rejection of an otherwise valid document is handled.

Custom-field updates, combined field submission, clearing, a separate edit-permission query, and a custom review screen are not delivery conditions for this version. The earlier rejected combined ACLI experiment changed neither selected field on D3X-25630; it did not verify a successful description write. Preserve that evidence in `cli-findings.md`.

If a required capability is unavailable, stop and ask the owner before changing scope, input formats, approval rules, or the Jira access boundary. A real Jira write used for validation requires separate approval of its exact target and content. Earlier approval of the failed combined experiment does not authorize another write.

### Required delivery artifacts

Implementation evidence is recorded in [validation.md](validation.md), including passed checks and unrun manual/live checks. This evidence does not change the approved requirements.

- An approved architecture decision record for description-only writes.
- Approved revised `spec.md`, revised `plan.md`, and `tasks.md` before implementation.
- Tests for successful description updates, blocked writes, rejected fields and empty documents, approval, changed descriptions, permissions, verification, uncertain outcomes, and existing read behavior.
- Updated package documentation, integration skill guidance, and affected repository and package glossaries and rule documents.
- A Changeset, the repository's package release note, for the published behavior change.

### Git and pull request wording

- **Branch:** `feat/jira-update-issue-content`
- **Commit subject:** `✨ feat(jira-integration): add approved description updates`
- **Pull request title:** `✨ feat(jira-integration): add approved description updates`
- **Pull request summary:** Add approved non-empty ADF description replacements for one Jira issue. Extend `jira_view` with optional complete document access. Require user approval in the conversation, pre-write description checks, and saved-value verification without a custom screen or terminal-only rule. Let Jira enforce edit permissions. Keep other fields and default Jira reads unchanged.

These are proposed delivery names. This specification does not create a branch, commit, or pull request.
