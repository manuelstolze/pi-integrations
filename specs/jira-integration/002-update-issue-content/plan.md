---
id: JIRA-002
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
status: approved
owner: '@manuelstolze'
---

# Plan JIRA-002 — Update issue descriptions

- **Specification:** [spec.md](spec.md), approved with optional document reads and approval in the conversation.
- **Plan status:** Approved by the human owner in this conversation.
- **Implementation:** Not authorized until the specification, plan, tasks, and required architecture decision are approved.
- **Evidence:** [cli-findings.md](cli-findings.md) records completed checks and the failed custom-field experiment.
- **Tasks:** [tasks.md](tasks.md), approved.
- **Architecture decision:** [ADR-0010](../../../docs/adr/0010-allow-approved-jira-description-updates.md), accepted.

## 1. Scope and approach

Extend `jira_view` with optional complete description document access. Add only one tool, `jira_update_description`, with prepare and apply actions.

Preparing an update reads the actual description and publishes a fixed proposal in the conversation. It does not write to Jira. A subsequent user message approves that named proposal. Applying it checks the actual user approval, re-reads the description, submits one ACLI edit, and verifies the saved document.

Use ACLI only. Let Jira enforce edit permissions during submission. Keep acceptance criteria updates, field mappings, clearing, and automatic retries out of scope.

Do not add a custom screen, confirmation dialog, terminal-only restriction, or Pi TUI dependency. All Pi modes use the same conversation approval rules. No user configuration or issue-data migration is required.

## 2. Package and module boundaries

Keep implementation source, tests, and package documentation under `packages/jira-integration/`.

| File or area | Planned responsibility |
| --- | --- |
| `src/domain/description-update.ts` | Document, snapshot, fixed proposal, approval, and result types; exact issue-key validation; non-empty content checks; structural equality. |
| `src/domain/adf-validation.ts` | Pure validation of Atlassian Document Format (ADF), Jira's structured JSON format for rich text. No content conversion or removal. |
| `src/domain/adf/full-schema.json` | Versioned copy of the published ADF schema with source and license notices. |
| `src/application/ports/jira-description-port.ts` | Authenticated target identity, complete issue-description reads, and one description replacement. |
| `src/application/ports/description-proposal-port.ts` | Store a pending proposal, publish its preview, record user approval evidence, consume approval once, and record the result. These are session capabilities, not generic file or command access. |
| `src/application/use-cases/update-description.ts` | Prepare and apply workflows. Validate inputs, coordinate ports, check changes, and classify verification results. |
| `src/application/use-cases/jira-tools.ts` | Add an internal complete-document view path while keeping existing read calls compatible. |
| `src/infrastructure/jira-cli-adapter.ts` | Implement the description port alongside the existing read port. Reuse authentication and safe command execution. Read raw descriptions and submit the exact description-only payload. |
| `src/infrastructure/description-files.ts` | Private temporary payload and complete-output files, with separate cleanup rules. No user-controlled output path. |
| `src/interface/pi/register-jira-tools.ts` | Add the optional `jira_view` input and its output handling. Preserve default read behavior. |
| `src/interface/pi/register-description-update-tool.ts` | Register the one new tool and map prepare/apply requests to the application. |
| `src/interface/pi/description-conversation-adapter.ts` | Observe actual user input, publish conversation previews, manage proposal and approval records through Pi session APIs, and handle session lifecycle. No UI components. |
| `src/index.ts` | Connect the new components and input/session handlers. Keep existing named exports unchanged. |

Dependencies point inward. Domain and application code must not import Pi, Node.js, command runners, or infrastructure. The application uses the two capability interfaces above. The Pi interface owns conversation events and session records. Infrastructure owns ACLI and files.

Keep the existing `JiraReadPort`, read-only client facade, and text normalizers compatible. Do not expose a public write method on the exported `JiraClient`; the internal write path requires the application approval workflow.

## 3. Read contract: extend `jira_view`

Existing input remains valid:

```json
{ "issueKey": "D3X-123" }
```

Add one optional boolean, defaulting to `false`:

```json
{ "issueKey": "D3X-123", "includeDescriptionDocument": true }
```

Without the option, keep the current call path, output text, limits, and result fields unchanged. With the option, return the existing issue details plus `descriptionDocument`, containing the complete stored ADF object, legacy string, or explicit `null`. Keep the existing plain text `description` field unchanged.

An omitted or unreadable raw description is not an explicit `null`. Return a clear error for that opted-in document read; do not invent an empty document. Default reads retain their existing missing-value behavior.

Implement an internal complete-document read operation that derives normalized issue details and the raw description from the same CLI response. Do not fetch a shortened description and a separate raw document from different issue versions. The existing public result types and client signatures need no required-field changes.

Return complete structured details. If model-facing text exceeds Pi's output limit, write the complete JSON to a private temporary file and return its absolute path with an explicit truncation notice. The agent can inspect it through the normal file read tool. Do not shorten data used by the application, approval record, or verification.

Do not register `jira_description` or another read tool.

## 4. Update contract: prepare, approve, apply

### Prepare

```text
jira_update_description({
  action: "prepare",
  issueKey: "D3X-123",
  description: <complete non-empty ADF document>
})
```

Validate the complete replacement, authenticate if needed, identify the active site/account, and read the complete current description. Create a private fixed proposal with a unique ID, target, original description, and replacement. Record and publish it in the conversation. Return `pending-approval`; do not write to Jira.

The preview identifies the site, issue key, complete current value, and complete proposed document. It warns that the description is replaced in full and that acceptance criteria are not selected. A readable summary can supplement the exact JSON, not replace it. If the full documents require a private file, provide an explicit link/path to that complete preview and keep the original immutable data in the session record.

The agent presents the proposal and asks for a user reply such as:

```text
Approve Jira update <proposal-id>
```

The identifier selects one exact proposal. It is not a secret and does not itself grant permission. Accept the exact approval sentence, with harmless case and surrounding whitespace normalization, from actual user input. Do not use a model to infer approval from arbitrary prose, quoted text, or a broad yes.

### Apply

```text
jira_update_description({
  action: "apply",
  proposalId: "<proposal-id>"
})
```

The caller supplies neither a replacement nor an approval flag on apply. Resolve the saved proposal and separately established user approval. Reject a missing, wrong-session, inactive-branch, cancelled, changed, or already-consumed proposal. Before any write, check the target and current description against the approved snapshot.

Use a strict union of prepare and apply input shapes. Reject extra properties, acceptance criteria, other fields, file paths, clear flags, arrays of issue keys, comma-separated keys, and Jira Query Language (JQL) selectors. Use an anchored issue-key check for prepare. Leave existing read validation compatible.

The model-facing document schema describes `type: "doc"`, `version: 1`, and structured `content`; the domain validator checks the complete recursive schema. Do not embed the entire vendor schema in the tool declaration.

Return typed outcomes such as `pending-approval`, `approval-required`, `cancelled-before-write`, `conflict`, `rejected`, `verified`, `unchanged`, `different`, and `unknown`. Keep submission errors separate from read-back observations. Include whether a write was attempted and the target identity. A failed command followed by an unchanged read-back is not success.

## 5. Conversation approval and session lifecycle

Use Pi's `input` event and session APIs, not `ctx.hasUI` or `ctx.mode`, to establish approval.

Local Pi `1.3.0` declarations expose input sources `interactive`, `rpc`, and `extension`. The inspected prompt implementation runs input handlers before skill/template expansion and defaults ordinary prompts to `interactive`. Print/JSON mode also submits prompts through that path. RPC input uses `rpc`. Extension-injected user messages use `extension`.

Observe only `interactive` and `rpc` input for approval. Ignore extension-sourced input, assistant text, tool results, Jira documents, custom messages, and model-generated approval arguments. Return `continue` so the user reply remains in the normal conversation. Keep the actual input text and source as evidence.

Before accepting an approval receipt, require the proposal preview to be a completed output on the active session branch. Reject approval received before publication, including queued input that predates the preview. At apply time, require a matching persisted user message after that preview as well as the trusted input receipt; a user-role message alone is insufficient because extensions can also inject user-role content. If another extension transforms or consumes the input so these checks cannot agree, do not write.

Use an explicit matching reply because it avoids asking the agent to declare that the user approved. Do not approve from a bare `yes`, an approval phrase inside a quotation, or a phrase copied into issue content. Provide a matching `Cancel Jira update <proposal-id>` reply to invalidate a pending proposal. A later user message revokes any unused approval receipt unless it is a fresh approval for that proposal.

Keep one pending proposal per active conversation. Preparing another proposal invalidates the previous pending one and its unused approval. The proposal stays fixed; edits require a new prepare action and a new ID.

Store proposal, preview, approval receipt, submission intent, and result as namespaced Pi session records. Use `pi.appendEntry()` for state outside model context and normal tool-result content/details for the preview. Record the actual approving user message or its session entry reference plus the exact text. Do not store credentials or unrelated issue fields.

On resume or reload, reconstruct unattempted pending proposals only from the active branch and require a fresh actual user approval input. Never restore an approval grant from a chat summary or a prior approved record. Do not carry approval into another session or a forked session ID. On tree navigation, clear in-memory approval grants and re-check the active branch.

Maintain a session-wide set of consumed proposal IDs so navigating back to a branch before a Jira write cannot authorize that external side effect again. Use all session entries only to find consumed/attempted IDs; use the active branch to select a pending proposal. This distinction is necessary because Jira changes are not undone by Pi branch navigation.

There is no terminal-mode restriction. Terminal and RPC conversations can approve on a later turn. A print/JSON caller can resume the same saved session and supply the explicit approval reply in a later invocation. A one-shot run without a subsequent user approval stops at the proposal. Missing evidence, not the mode name, prevents a write.

The local Pi process, installed extensions, session storage, and the calling user/client are trusted. These checks do not prove a person is physically at a keyboard or protect against an extension that controls the process or tampers with session files. Do not claim that they block arbitrary shell commands outside this integration.

## 6. ADF validation and dependencies

Use the published schema from `@atlaskit/adf-schema` version `57.7.26` as a package-local data file. This avoids installing its editor dependency tree.

Add runtime dependencies `ajv` with range `^8.20.0` and `ajv-draft-04` with range `^1.0.0`. Ajv is a JSON Schema validator; the second package supports the draft-04 schema used by ADF. Keep resolved versions in `package-lock.json`. Do not add a Pi TUI dependency.

Compile the schema once per extension runtime. Disable automatic type changes, property removal, and default insertion. Do not fetch schemas or follow remote references at runtime. Reject invalid or unsupported documents with a useful validation path. Schema validity does not guarantee Jira accepts every node; server rejection remains an expected error.

After schema validation, reject content consisting only of empty containers, whitespace, or line breaks. Meaningful content includes non-whitespace text or a valid content-bearing leaf such as a mention, emoji, date, status, card, media item, extension, or horizontal rule. Empty lists, empty table cells, and formatting alone must not make a blank document non-empty.

Copy the schema without editing its rules. Record the exact source version, URL, checksum, and update procedure. Retain the source package's applicable Apache-2.0 license and notices in package-local `LICENSES/atlassian-adf-schema.txt` and `THIRD-PARTY-NOTICES.md`, and publish them. Check the source archive for additional required notices before copying.

Enable `resolveJsonModule` and include the JSON file in the package's `tsconfig.json`. Use the JSON import form supported by the repository compiler and Node.js 22 baseline. Confirm the compiled package includes the schema and loads it without source files or network access. Do not change the root compiler configuration or minimum Pi version.

## 7. Document snapshots and equality

Represent a current description as a complete ADF object, legacy string, or known empty value. Use property-presence checks to reject omitted or unreadable values. Only a proposed replacement must pass the replacement schema; preserve existing descriptions exactly, even if they contain newer stored properties.

Copy the replacement before asynchronous work. Keep the fixed proposal private so later tool-input mutation or an edited output file cannot change the approved value.

Compare JSON structurally: ignore object-key order but preserve array order and every value, text mark, and document property. Do not remove `localId`, merge text nodes, or flatten content. Report any unequal server rewrite as `different`, rather than treating equal plain text as success.

## 8. ACLI access and apply workflow

The installed `acli 1.3.39-stable` help and generated edit example document this description-only shape:

```json
{
  "issues": ["D3X-123"],
  "description": {
    "type": "doc",
    "version": 1,
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Approved replacement." }]
      }
    ]
  }
}
```

Submit one command:

```text
acli jira workitem edit --from-json <private-payload-file> --yes --json
```

The adapter constructs only `issues` and `description`, with exactly one issue key. Never copy a complete issue response into the payload. Do not use custom fields, additional selectors, `--ignore-errors`, or a second issue key. CLI `--yes` suppresses its own prompt only after conversation approval is established.

Create a private temporary directory with mode `0700` and payload file with mode `0600`. Remove them in `finally` after process completion. Report cleanup failure without hiding the submission or verification result. The application passes document values, not file paths.

Read complete snapshots through `acli jira workitem view <key> --json --fields '*all'`, matching the observed raw reads. Retain only needed data after parsing. Identify the actual site and account from `acli jira auth status`; strip terminal styling and reject missing or ambiguous labelled identity. Neither `JIRA_URL` nor the internal issue `self` host proves the active CLI site.

Initial prepare may use the existing optional login flow. Apply must not log in or switch accounts under an earlier approval. Re-check the active identity before writing and before verification. Never verify against a different site. Keep the existing 30-second per-command timeout and injected argument-array command runner without a shell.

The apply workflow is:

1. Enter an extension-local apply queue and validate the session, active proposal, completed preview, and user approval evidence.
2. Record that the proposal and approval are consumed before starting submission work. A second apply cannot reuse them, even if the first fails.
3. Re-check the target identity and complete description against the reviewed snapshot. Stop and record `conflict` or the check error if they changed or cannot be established. Continuing requires a new proposal and new approval.
4. Check cancellation, record submission intent, and invoke the write port at most once. Do not authenticate or retry inside submission.
5. After any submission result, try one bounded read-back on the same target. If cancellation occurred after submission, use a fresh bounded signal for read-only verification, not the cancelled write signal.
6. Compare the saved document first with the approved document and then with the original. Record `verified`, `unchanged`, `different`, or `unknown`, together with the safe command outcome.
7. Record and return the result. Release the queue and remove temporary write files on all paths. If recording fails after submission, report that failure and any established saved state without retrying the write.

Do not hold a queue or a running tool call open while waiting for a future user reply. Prepare returns immediately. Apply serializes only the final check/write/verify operation. Pre-write reads and this local queue cannot prevent every concurrent Jira edit or external ACLI account change; document the remaining race.

## 9. Records, temporary output, and failure handling

A failure to record the proposal, approval, or consumed state before submission stops the write. A timeout, process error, permission rejection, invalid saved response, or failed verification must not become a claim that Jira stayed unchanged without supporting read-back evidence.

Use an entry type such as `jira-description-update` and link records by proposal ID. Keep the exact original and replacement, target, approving input source/text and session reference, consumed state, submission status, and verification observation. Session records are an update record, not reusable approval.

Temporary complete-output files support large reads and previews; they are not another audit log. Use private permissions and generated paths. Remove managed output files on session shutdown with best-effort cleanup. Persist the full fixed proposal in the session so a later approval does not depend on a temporary preview path surviving a print-mode exit. A resumed conversation must be able to reproduce the same preview from that stored data.

Pi's session API is not a transaction shared with Jira. Do not claim crash-proof storage or atomicity between a write and a session entry. After interruption or uncertain history, do not restore an old approval grant or automatically finish the update. Require a fresh proposal/approval when prior attempt state is uncertain.

## 10. Compatibility, documentation, and architecture decision

Keep existing tool names, default read inputs and behavior, result fields, public exports, client method signatures, and authentication compatible. Add only the optional `jira_view` boolean and the one new update tool. Existing tests that assert exactly three registrations must account for the fourth without weakening coverage of the original three.

Do not change existing `JiraClientOptions` requirements or export application ports. Do not add custom-field configuration or a review UI package.

Before implementation, obtain approval for [ADR-0010](../../../docs/adr/0010-allow-approved-jira-description-updates.md), the proposed amendment that adds description-only writes under ADR-0001. Follow `docs/adr/README.md`. Keep accepted decision text unchanged. ADR-0002's CLI boundary and ADR-0005's layer rules remain unchanged.

Update during delivery:

- `packages/jira-integration/README.md`: optional document reads, prepare/approve/apply examples, the explicit approval reply, mode-independent behavior, dependencies, temporary files, permissions, errors, and concurrency limits.
- `packages/jira-integration/skills/jira-integration/SKILL.md`: read the complete document when drafting; prepare a complete ADF replacement; show the fixed preview; wait for the user's matching reply; apply only its ID; never bypass a rejected write tool through shell commands. Use the writing-for-agents skill when editing this file.
- `packages/jira-integration/README.md` and repository `README.md`: delivered Jira capabilities and stable safety rules. Use `GLOSSARY.md` and `GLOSSARY-MAP.md` only for terms and context relationships.
- `packages/jira-integration/package.json`: package description, planned validator dependencies, and published license notices.
- `packages/jira-integration/tsconfig.json` and root `package-lock.json`: schema import and dependency changes.
- Package schema-source documentation and third-party notices from section 6.
- A minor-version Changeset for `@manuelstolze/pi-jira-integration` under `.changeset/`.

Keep `packages/jira-integration/GLOSSARY.md` unchanged unless a term changes. Do not edit global Jira authoring skills. No source or configuration changes are part of this planning task.

## 11. Tests and acceptance gates

Map all 15 specification acceptance criteria to tests when writing `tasks.md`.

| Test level | Required coverage |
| --- | --- |
| Domain | Valid and invalid ADF, meaningful versus blank content, no input mutation, exact issue keys, structural equality, and documents with equal plain text but different formatting. |
| Application | Prepare never writes. Apply requires a fixed proposal and real matching approval. No write on invalid input, missing data, cancellation, wrong target, conflict, failed recording, or replay. At most one submission; classify rejected, unchanged, different, verified, and unknown outcomes. |
| Infrastructure | Exact two-key payload, one-key issue array, safe temporary files and cleanup, complete raw reads, explicit null versus missing fields, legacy descriptions, active-site parsing, no login after approval, safe errors, and independent verification cancellation. |
| Pi interface | Optional view input and unchanged default output; one additional tool; strict prepare/apply schemas; full preview output; actual input source and persisted-message matching; rejection of agent/extension claims, quoted approvals, premature approvals, and bare yes; cancel and superseded proposals; consumed IDs across branches; fresh approval on resume. |
| Modes and lifecycle | Terminal, RPC, JSON, and print paths use the same approval rule. Test prepare in one invocation and approve/apply in a resumed saved session. One-shot unapproved runs never write. Verify active branch, reload, fork, cancellation, and session shutdown behavior. |
| Compatibility and packaging | Existing read tools, result types, named exports, authentication, operation without write support, offline compiled schema loading, published license files, and no new Pi TUI dependency. |

Pi event/source ordering and conversation publication must have integration tests with an in-memory session and fake Jira ports. Verify that pending approval does not block the user from sending the next message. Use print/JSON session continuation tests without contacting Jira. Fake-port tests do not establish that a live Jira write succeeded.

After implementation and the required approvals, run:

```bash
npm test -- --run packages/jira-integration/test
npm run typecheck
npm run build
npm test
npm pack --workspace @manuelstolze/pi-jira-integration --dry-run --json
```

A successful live description-only write remains unverified. Any end-to-end Jira check needs a fresh exact proposal and separate user approval. Approval of this plan does not authorize another edit to D3X-25630, marker insertion, clearing, or restoration. Report unrun live checks as release limitations.

## 12. Evidence, risks, and delivery wording

### Evidence and remaining checks

The documented CLI edit shape, raw ADF read, actual site output, published schema, and validator dependency metadata are recorded in `cli-findings.md`. Pi `1.3.0` source and declarations establish the input source labels and prompt paths used by the proposed approval design. These are source checks, not completed runtime tests of the new workflow.

Implementation must still verify schema compilation, packaging and license notices, user-message ordering, preview delivery, saved-session continuation, and actual tool behavior. Jira can reject schema-valid ADF or rewrite a saved document; return rejection or mismatch rather than hiding it. If Pi cannot establish the required conversation approval evidence on a supported path, stop and ask the owner before weakening the rule.

Temporary files and session records contain issue content. Use private permissions and do not assume their contents are public or free of secrets. Retain existing credential redaction and do not output raw authentication data.

Stop and ask before adding fields, clearing, a write fallback, a UI requirement, a mode-based restriction, or weaker approval/comparison. Do not silently drop validation or license notices to solve a dependency problem.

### Git and pull request wording

- **Branch:** `feat/jira-update-issue-content`
- **Commit subject:** `✨ feat(jira-integration): add approved description updates`
- **Pull request title:** `✨ feat(jira-integration): add approved description updates`
- **Pull request summary:** Extend `jira_view` with optional complete document access and add one description update tool. Prepare a fixed non-empty ADF replacement, obtain explicit user approval in the conversation, apply it once through ACLI, and verify the saved value. Keep other fields and default reads unchanged.

No branch, commit, or pull request was created by this planning task.
