---
status: accepted
date: 2026-10-30
last_reviewed: "2026-10-30 — valid"
approvers:
  - '@manuelstolze'
related:
  - ADR-0001
  - ADR-0002
  - ADR-0005
  - JIRA-002
---

# ADR 0010 — Allow approved Jira description updates

## TL;DR

Allow one issue's description to be replaced through ACLI after explicit user approval of an exact proposal in the conversation. Keep other fields and default reads unchanged, and verify the saved description before reporting success.

The human owner approved this architecture decision record (ADR) in the JIRA-002 conversation.

## Context

ADR-0001 established read-only Jira access for the first release. It permits future writes only after permission, confirmation, validation, and update-record rules are defined.

Users now need description updates. The original request also included acceptance criteria updates. An approved experiment with ACLI version `1.3.39-stable` rejected `additionalAttributes` in edit input. Read-back confirmed that neither selected field changed. The owner deferred acceptance criteria updates and clearing instead of introducing another Jira access method.

The existing `jira_view` converts descriptions to text and can shorten them. A replacement drafted from that text alone could lose content or formatting. Complete stored documents must therefore be available through an optional read input and must be read again before applying an update.

The owner chose approval in the conversation. A custom review screen and terminal-only write rule are not required. The implementation must distinguish actual user approval from an agent claim and must not infer approval from Jira content.

**Scope:** This decision adds description-only writes under ADR-0001. It does not replace the first-release history or allow general issue editing. ADR-0002's CLI access boundary and ADR-0005's layer rules remain unchanged.

## Options in scope

- **Keep read-only access:** Retain the current product boundary and do not deliver description updates.
- **Description updates with conversation approval:** Prepare one fixed description replacement, obtain explicit user approval in the conversation, apply it once, and verify the saved document.
- **Description updates with a custom terminal screen:** Use a dedicated review interface, but add UI code and restrict where the complete approval flow can run.
- **Description and acceptance criteria updates now:** Retain the original wider scope, but wait for an established custom-field edit contract and combined-field submission through ACLI.

### Comparison

The proposed criteria come from the user's scope and safety choices. Criteria concerning allowed fields, ACLI-only access, exact approval, and saved-value verification are requirements, not optional benefits. Extra UI work and delayed delivery are trade-offs.

| Criterion | Keep read-only access | Description + conversation | Description + terminal screen | Description + acceptance criteria |
| --- | --- | --- | --- | --- |
| Deliver description updates now | No | Documented CLI input; implementation remains to be verified | Documented CLI input; implementation remains to be verified | Blocked by missing custom-field edit evidence |
| Limit writes to the approved field scope | No writes | Description only | Description only | Wider scope |
| Use ACLI only | Yes | Yes | Yes | Required, but full edit support is not established |
| Bind approval to an exact proposal | No write approval needed | User input evidence plus fixed proposal | Dedicated dialog | Still needs the same rule |
| Avoid a terminal-only restriction | Yes | Yes, with matching user approval | No | Possible, but does not resolve CLI support |
| Added review interface work | None | Conversation and session handling | Conversation/session handling plus custom UI | Conversation/session handling plus field mappings |

The human owner approved these comparison criteria with this ADR.

## Decision

We will allow only full, non-empty description replacements for one existing issue at a time.

1. Keep `jira_search`, `jira_view`, and `jira_comments` read-only. Add optional complete stored description access through `jira_view`; do not add a separate description read tool.
2. Add one update tool with prepare and apply actions. Prepare creates and publishes an exact fixed proposal; it never writes to Jira.
3. Accept replacements in Atlassian Document Format (ADF), Jira's structured JSON format for rich text. Validate the complete document and reject empty or malformed replacements without converting or dropping content.
4. Require an actual user message approving the published proposal in its conversation. Link the approval to the exact target and replacement, and permit one attempt only. An agent approval flag, Jira text, or an old session summary cannot authorize a write.
5. Do not require a separate dialog, a custom terminal screen, or a particular Pi mode. Missing approval evidence blocks a write; the mode name alone does not.
6. Use the authenticated user's existing Jira permissions. Let Jira accept or reject the approved submission; do not require a separate permission query that ACLI does not expose.
7. Check the authenticated target and complete description again before writing. A changed or unknown value stops the attempt and requires a fresh proposal and approval.
8. Submit only the description through ACLI, once. Never update acceptance criteria or another field as part of this capability. Do not bypass failures with direct HTTP access or another write method.
9. Read back when possible and compare document structure and values, not just plain text. Report verified, unchanged, different, or unknown saved state together with submission errors.
10. Record the exact proposal, approving user message, attempt, and verification result in the Pi session without credentials. Do not create another audit file or Jira comment.
11. Do not retry, clear the field, restore earlier content, or use an approval again after an attempt without a new approved proposal.

This ADR amends ADR-0001 only for this limited write capability. ADR-0001 remains accepted, its decision text remains unchanged, and its `amended_by` metadata links to `ADR-0010`.

## Consequences

- **Positive:** Users can update descriptions with an exact proposal and an established CLI access path. Existing read behavior stays compatible. No new custom review UI or custom-field mapping configuration is needed.
- **Negative / trade-offs:** The workflow spans more than one conversation turn. It needs session state to bind and consume user approval. Schema-valid ADF can still be rejected or rewritten by Jira. Strict document comparison can report a mismatch even when visible text looks the same.
- **Limits:** A read followed by a write cannot prevent every concurrent Jira edit or external CLI account switch. Pi session storage and Jira do not share a transaction. The integration does not prove physical human presence or protect against a trusted host/extension that tampers with session records.
- **Follow-ups:** Complete implementation and tests under the approved JIRA-002 artifacts. Update package and repository contexts when the capability is delivered. A successful live description write still needs a separately approved test; do not claim the earlier rejected experiment verified it.

## Alternatives considered

- **Keep read-only access** — safe but does not meet the approved request for description updates.
- **Description updates with a custom terminal screen** — the owner chose conversation approval and rejected a terminal-only requirement. The custom UI adds work without being required by the agreed scope.
- **Description and acceptance criteria updates now** — the tested custom-field edit format was rejected, and an alternative supported format was not established. The owner chose to defer acceptance criteria rather than keep delivery blocked by that uncertainty.

### Eliminated early (out of scope)

- **Direct Jira HTTP writes or another Jira CLI** — conflict with the owner's explicit ACLI-only choice and would change ADR-0002's access boundary.
- **Agent-declared approval** — does not establish that the user approved the exact proposal.
- **Copy acceptance criteria into the description** — changes the meaning and location of issue content instead of delivering the requested limited update.

## References

- [JIRA-002 specification](../../specs/jira-integration/002-update-issue-content/spec.md)
- [JIRA-002 technical plan](../../specs/jira-integration/002-update-issue-content/plan.md)
- [CLI and Pi evidence](../../specs/jira-integration/002-update-issue-content/cli-findings.md)
- [ADR-0001](0001-read-only-jira-access.md)
- [ADR-0002](0002-use-atlassian-cli-for-jira-access.md)
- [ADR-0005](0005-adopt-hexagonal-ddd-architecture.md)
