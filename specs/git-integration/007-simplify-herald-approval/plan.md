# Technical plan: Simplify Herald approval

## 1. Status and approval

- **Specification:** `specs/git-integration/007-simplify-herald-approval/spec.md`
- **Specification approval:** The human owner approved the spec in the conversation.
- **Plan status:** Approved by the human owner in the conversation.
- **Task breakdown:** In preparation. Owner approval is required before implementation.

Implementation can start only after the owner approves the spec, this plan, and
`tasks.md`. This plan does not authorize implementation or Git history changes.

## 2. Context and evidence

### Current behavior

- `packages/git-integration/src/interface/pi/render-instructions.ts` asks for
  chat approval and says that the exact-command dialog remains mandatory.
- `packages/git-integration/src/interface/pi/extension.ts` detects selected Bash
  command text, enforces mode limits, and uses `ctx.ui.confirm` for allowed
  detected actions. It keeps Herald active across chat replies.
- `packages/git-integration/test/pi-adapter.test.ts` and
  `packages/git-integration/test/supported-host.test.ts` cover the current dialog
  and workflow lifetime. The supported-host test uses a fake Bash tool.
- Pi's extension documentation describes `input` source information,
  `tool_call`, `tool_execution_end`, custom messages, and model-only tools.
  The installed Pi package is version 1.3.0, within the package's declared range.
  These are API observations, not proof that the proposed sequence works.

### Approved outcome

One chat approval covers the commit stage. A separate chat approval covers the
push and review-request stage. Herald checks detected commands and their relevant
inputs. It does not show its own command dialog.

The owner also chose limited, checkable command forms and chose to let the
workflow model interpret the user's reply. This avoids a separate model request.
The model can misread the reply or incorrectly report approval. The check is not
independent of the model's interpretation.

### Context and decisions

Read `CONSTITUTION.md`, `GLOSSARY-MAP.md`, `GLOSSARY.md`, `CONTRIBUTING.md`,
`packages/git-integration/README.md`, and `packages/git-integration/CONTEXT.md`.
The package glossary named in the map is absent. Preserve the shared request
flow in `docs/adr/0004-use-one-review-request-flow-for-github-and-gitlab.md` and
the layer rules in `docs/adr/0005-adopt-hexagonal-ddd-architecture.md`.

No tests have been run for this plan. Event ordering, message display, input
checks, and command compatibility must be verified before implementation is
considered complete.

## 3. Technical approach and boundaries

### Proposal and chat reply

1. Add an internal, model-only proposal tool. It receives structured stage data,
   including the plan, input references, and ordered commands. The extension
   validates the stage against the active mode and accepts only supported command
   forms. It creates a new proposal identity and invalidates prior approval.
2. Render the proposal as a visible Pi chat message owned by the extension,
   rather than trusting a separate model summary to match the stored proposal.
   Show every complete command and the relevant plan details. Do not truncate
   the approved material. If the full proposal cannot be displayed, do not arm
   it. Verify the actual host's display and delivery order in tests.
3. Accept a reply only after the proposal is displayed and Herald is waiting.
   Record the actual interactive or RPC user input, its session, and the current
   proposal identity. Do not accept extension-generated messages as user
   approval. Do not treat queued input sent before the proposal as approval.
4. Add a model-only reply-report tool. The workflow model reports whether that
   recorded reply unconditionally approves the current proposal. The extension
   checks that a current human reply exists and that its proposal identity and
   session match. A missing, stale, negative, conditional, or unclear report
   grants no approval. The model must ask for a revised proposal or another reply
   when needed. This check binds the report to a real reply; it cannot prove that
   the model interpreted that reply correctly.
5. Keep the existing Herald command names. Activate the internal tools only for
   an active run and remove only tools that the run activated. Restore the
   existing model and thinking selections at the established cleanup boundaries.

The two new model-only tools are a change to the model-facing contract. Their
names and schemas must be documented in the implementation and tested on the
minimum supported Pi version. They are not new user slash commands.

### Supported commands and input checks

Use structured proposal fields to generate canonical command text rather than
attempting to understand arbitrary shell programs. The proposal shown to the
user and the guard use the same generated command text. Compare the entire Bash
command string, not just its detected action. Do not normalize a different
command into an approved one after approval.

Start with explicit, testable forms for `git commit`, `git push`, `gh pr create`,
and `glab mr create`. Use explicit branches and paths rather than shell variables
whose values are unknown at approval. Treat shell operators, substitutions,
redirections, wrappers, and additional flags as unsupported unless their exact
form and inputs are explicitly supported and tested. Investigate support for the
owner's `set -e` / `rtk git add` / `rtk git commit` pattern; do not assume that
`rtk` has the same behavior as Git. If it cannot be checked, propose a supported
alternative and obtain approval of that exact alternative in chat.

For commits, record the proposed file set, message, and content snapshot before
display. Before each detected commit command, compare the current relevant
working-tree and index state with the approved snapshot. Account for staged,
unstaged, added, deleted, binary, and partially staged files. A multi-commit plan
needs a separate expected snapshot for each commit, including the effects of
preceding successful commits. Do not accept an input that cannot be represented
and checked reliably. If a combined add-and-commit form is supported, its
allowed paths and resulting index must be checkable before it starts; otherwise
block it and propose separate supported commands.

For request creation, store the exact approved title and description. If the
command reads a description file, compare its actual bytes and path with the
approved input immediately before the action. Do not rely on an uncontrolled
shell variable or temporary file. Check the approved branch and target values
for the supported push and creation forms. Preserve the existing check for an
open request and do not create a duplicate.

The input check is a pre-execution check. A separate process, Git hook, or later
extension handler can change data after that check. The existing text-based
Bash guard is not a sandbox and does not detect every indirect action. Document
these limits. Do not claim that a pre-execution comparison proves the final Git
object or remote request is unchanged. If a supported form cannot meet the spec's
pre-execution checks, block it; do not add an undocumented workaround.

### State, failure, and cleanup

Keep stage state scoped to the current Herald run and session: proposal identity,
rendered proposal, input snapshots, recorded reply, approval state, and ordered
command attempts. A new proposal clears the previous approval. A user revision
clears unused approval without reversing completed actions.

The existing mode guard runs before the approval check. Block a detected command
when the mode disallows it, no UI is present, the proposal is not approved, the
command or inputs differ, or another approved action is still running. Reserve
and consume an attempt before dispatch so repeated or parallel calls cannot use
one approval twice. Use `tool_execution_end` to observe success or failure,
including blocked or aborted calls. Do not treat a failed or aborted attempt as
success. Follow the existing terminal failure rules for push and request
creation. A retry needs a new proposal and approval; after a terminal push or
request failure it also needs a new run.

Clear approval on stage completion, cancellation, terminal completion or
failure, reload, session replacement, and proposal replacement. Preserve the
existing `herald_finish` and model restoration behavior. Check for late tool
results and stale input after cancellation or session change.

### Layers and compatibility

- Put provider-neutral approval and attempt rules in `domain/` and workflow
  coordination and capability-specific ports in `application/`.
- Put Git, filesystem, and provider-specific input inspection in
  `infrastructure/`; keep Pi events, tools, rendering, and session handling in
  `interface/pi/`. Connect new adapters in `src/index.ts`.
- Do not expose a generic command runner through an application port. Keep
  GitHub and GitLab details inside their provider boundaries.
- No dependency or settings change is planned. Do not edit the lockfile unless
  a separately approved dependency change becomes necessary. Existing settings
  and saved sessions need no migration; unfinished approval is not resumed.
- Preserve the existing Git and hosting behavior outside the approval change.

## 4. Affected files

| Path | Planned change | Requirement |
| --- | --- | --- |
| `packages/git-integration/src/domain/` | Add stage approval and one-attempt rules. | FR-003, FR-007–009 |
| `packages/git-integration/src/application/` | Coordinate proposals and define narrow input-check ports. | FR-001–009 |
| `packages/git-integration/src/infrastructure/git/` and `hosting/` | Check supported Git and request inputs. | FR-004–006 |
| `packages/git-integration/src/interface/pi/extension.ts` | Bind proposals and replies to the active run; enforce the guard and cleanup. | FR-003–011 |
| `packages/git-integration/src/interface/pi/render-instructions.ts` | Describe the stage flow and supported command forms. | FR-001–003 |
| `packages/git-integration/src/interface/pi/` | Add proposal rendering and model-only tool handling as needed. | FR-001–006 |
| `packages/git-integration/src/index.ts` | Connect any new capability-specific adapters. | Layer rules |
| `packages/git-integration/test/` | Add domain, adapter, Pi interface, and supported-host tests. | FR-012 |
| `packages/git-integration/README.md` and `CONTEXT.md` | Document approval, supported forms, and limits. | FR-012 |
| `.changeset/simplify-herald-approval.md` | Record the published behavior change. | Release rule |

Use specific file names in the task breakdown after the design is verified. Do
not edit generated `dist/` files.

## 5. Documentation and release impact

- Update the package README and context with both approval stages, supported
  forms, input checks, natural-language interpretation risk, command-detection
  limits, and effects of cancellation or failure.
- No glossary term or context relationship is changed by this plan. The missing
  package glossary is an existing documentation issue, not a prerequisite for
  this change.
- Preserve the accepted ADRs. No new ADR is proposed.
- Add a patch Changeset for `@manuelstolze/pi-git-integration` unless release
  review identifies a reason for a different version bump.
- No personal settings, migration, or dependency replacement is planned.

## 6. Verification strategy and acceptance gates

| Spec criterion | Planned test or check |
| --- | --- |
| 1–3 | Interface and supported-host tests for commit, request, and full modes; multi-commit plans; GitHub and GitLab; no Herald dialog. |
| 4 | Tests for no reply, denial, conditional or unclear reports, stale proposal IDs, wrong session, and extension-generated input. Test the model-report limitation explicitly. |
| 5 | Input adapter tests for changed command, staged and unstaged changes, added/deleted/binary/partially staged files, changed request bytes, unsupported forms, and failed checks. |
| 6–7 | Interface tests for one attempt, failed or aborted action, terminal push failure, partial execution, and revised proposals. |
| 8 | Lifecycle tests for stage completion, replacement, cancellation, reload, session change, and late events. |
| 9 | Retain and extend the existing mode/action matrix, mixed-command, and no-UI tests. |
| 10 | Review package documentation and Changeset. Run package and repository checks. |

Add a supported-host test that exercises the real proposal display, a later
human chat reply, a model report, and the Bash guard. Use fake commands and
providers; do not create a real commit, push, or review request. Test queued
input, parallel tool calls, output delivery order, tool attempt consumption,
and changed inputs between proposal and execution. Also test the minimum
supported Pi 1.3.0 API. Tests cannot prove that a model always interprets a
reply correctly or that other processes cannot change inputs after the check.

After all approvals, run from the repository root:

```bash
npm test -- --run packages/git-integration/test
npm run typecheck
npm run build
npm test
git diff --check
```

Record actual results in `tasks.md`. Report failed and unrun checks separately.
No external hosting access is required for the planned automated tests.

## 7. Work sequence, risks, and open points

1. After all approvals, verify the host message and input sequence with focused
   tests. Verify the limited command forms and input snapshots before wiring them
   into the approval guard.
2. Implement the stage rules, input adapters, model-only tools, and lifecycle
   checks. Preserve the current mode matrix and failure handling.
3. Update tests, documentation, and the Changeset. Run the planned checks and
   review the diff.

| Risk or open point | Impact | Required action |
| --- | --- | --- |
| The workflow model misreads a reply or reports approval incorrectly. | An action could run after a reply that did not approve it. | Document the risk and test the binding to a real reply; do not claim independent verification. |
| Pre-execution checks race with external changes, hooks, or later extension handlers. | The final action can differ from the checked state. | Document the boundary; investigate and test feasible checks. Stop and ask the owner if the approved spec cannot be met. |
| Complex command forms or `rtk` cannot be checked. | A previously used command may be blocked. | Offer a supported exact alternative; do not silently execute it. |
| Pi 1.3.0 does not deliver a proposal or reply in the required order. | Chat approval may bind to the wrong proposal. | Prove ordering in supported-host tests. Stop for an owner decision if unsupported. |
| A separate permission extension is active. | It may still show its own approval dialog. | Keep that extension unchanged and state the limit in the README. |

No dependency reinstall, configuration overwrite, real Git mutation, or release
is authorized by this plan.

## 8. Delivery and approval checkpoint

- **Proposed branch:** `feat/simplify-herald-approval`
- **Commit subject:** `✨ feat(git-integration): simplify Herald approval`
- **Pull request title:** `✨ feat(git-integration): simplify Herald approval`
- **Pull request summary:** Replace duplicate Herald dialogs with checked chat
  approval for each stage. Retain mode limits and document the detection and
  model-interpretation limits.
- **Existing work to preserve:** The approved spec in this directory and the
  existing `specs/git-integration/006-share-gitlab-target-order/` artifacts.
- **Owner decision needed:** Approve the task breakdown before code or tests
  change.
