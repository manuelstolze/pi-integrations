---
id: GIT-007
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: '@owner'
---

# Spec GIT-007 — Simplify Herald approval

- **Domain:** `git-integration`
- **Status:** Approved by the human owner in the conversation. Planning may start.

## 1. Problem and intent

Herald asks the user to approve a plan in chat. It then asks again in a dialog
before each detected commit, push, or review-request creation command. The user
wants one approval per stage, without removing the check that protects detected
actions.

Herald must show the plan and exact commands in chat. A chat reply can approve
those commands for the current stage. Herald must check that approval before a
detected action runs. Herald's own command approval dialogs must not appear.

## 2. Scope

### In scope

- Use chat approval for the commit stage and the review-request stage.
- Show the full plan and exact commands together before each stage's approval.
- Check the approval, commands, and relevant approved inputs before detected
actions run.
- Handle changed plans, failed commands, partial work, and approval expiry.
- Apply the same rules in commit, request, and full modes, for GitHub and GitLab.
- Test and document the changed behavior and add a Changeset, a release note
  for the published package.

### Out of scope

- Expand the existing command detection coverage to every shell syntax, script,
  or indirect call.
- Change other extensions' approval checks or Pi's own permissions.
- Change mode action limits, provider selection, target-branch rules, duplicate
  request handling, or automatic branch deletion behavior.
- Change Herald settings, write personal settings, or reverse completed Git
  actions automatically.

## 3. Requirements

- **FR-001:** Herald MUST present the commit plan, including all planned commits,
  their files, complete messages, and exact commands, before requesting a single
  chat approval for the commit stage.
- **FR-002:** Herald MUST present the review-request title and full description,
  and the exact push and request-creation commands, before requesting a single
  chat approval for that stage. The existing duplicate-request check remains in
  force; approval does not require creation of a duplicate.
- **FR-003:** A clear, unconditional user reply in chat MUST be able to approve
  the proposal for its current stage. Herald MAY use the model to interpret
  natural-language replies. A reply that requests a change, adds a condition,
  denies approval, or is unclear MUST NOT approve the original proposal.
- **FR-004:** Before running a detected action, Herald MUST check that the user
  approved its current stage and that the full command matches a command in the
  approved proposal. Herald MUST block the action if the check cannot establish
  this. Herald MUST NOT show its existing command approval dialog.
- **FR-005:** Herald MUST check that approved commit content and the approved
  review-request description have not changed before the relevant action runs.
  If an input has changed, or Herald cannot establish that it is unchanged,
  Herald MUST stop the affected action, show the change or explain the problem,
  and request approval of a revised proposal before proceeding.
- **FR-006:** If a command changes, Herald MUST show the changed command and wait
  for a new chat approval before running it.
- **FR-007:** Each approved command permits at most one attempt. After a failed
  command, Herald MUST show the failure and obtain new chat approval before a
  retry. A failed push or request creation still ends the current workflow; a
  retry requires a new workflow and approval.
- **FR-008:** If the user requests a change after some approved commands have run,
  Herald MUST keep completed actions, stop unused commands, and request approval
  of a revised plan for the remaining work. It MUST NOT undo completed actions.
- **FR-009:** Unused approval MUST expire at the end of its stage and when the
  workflow is cancelled or completes, the session changes, or a new proposal
  replaces the approved proposal. Approval MUST NOT carry into another run.
- **FR-010:** Existing mode limits MUST continue to block disallowed detected
  actions, including a mixed command containing a disallowed action. A missing
  user interface or missing approval MUST NOT allow a detected action to run.
- **FR-011:** Existing Herald workflow lifetime, cancellation, model restoration,
  provider selection, target selection, and duplicate-request rules MUST remain
  in force, except for the approval behavior explicitly changed here.
- **FR-012:** Tests MUST cover the required approval, blocking, change, retry,
  expiry, and partial-work behavior across the applicable modes and providers.
  Documentation MUST explain the changed approval flow and its detection limits.

## 4. Capability deltas

- **Modified:** One chat approval covers the approved commands for each stage.
- **Modified:** Detected actions require a check against the chat-approved
  commands and relevant inputs, instead of a separate Herald command dialog.
- **Modified:** A command attempt, changed proposal, stage completion, or workflow
  cleanup limits the use of approval as described above.
- **None:** Mode action limits, provider choice, and review-request rules remain
  unchanged.

## 5. Acceptance criteria

1. In commit mode, Herald shows a multi-commit plan and exact commands. One chat
   reply approves the plan. Each matching detected commit command may run once
   without a Herald approval dialog.
2. In request mode, Herald shows the request title, description, push command,
   and creation command. One chat reply approves the stage. Matching detected
   commands may run without a Herald approval dialog.
3. In full mode, approving commits does not approve the later request stage.
   Both GitHub and GitLab use the shared approval flow.
4. A denied, conditional, unclear, or revision reply does not authorize the
   original commands. A detected command without valid approval is blocked.
5. A changed command, changed commit content, or changed request description
   does not run under the prior approval. Herald presents a revised proposal
   and waits for a new reply. An input that cannot be checked is not accepted.
6. A failed command cannot run again under the same approval. A retry requires
   a new chat approval. A failed push or request creation ends the current
   workflow, so a retry also requires a new workflow.
7. A request to change a plan after partial execution keeps completed actions,
   stops the remaining commands, and requires approval of the revised work.
8. Approval does not survive stage completion, cancellation, workflow completion,
   a session change, or replacement of the proposal. A later run starts without
   approval from the earlier run.
9. Commit mode still blocks detected pushes and review-request creation. Request
   mode still blocks detected commits. Mixed commands with disallowed actions
   remain blocked. No user interface means no detected action runs.
10. Tests cover these cases and the package documentation describes the new flow
    and the limits of text-based detection. Relevant checks are run and reported.

## 6. Domain notes

A **review request** is a GitHub pull request or a GitLab merge request. A
**stage** is the commit portion or the push and review-request portion of one
Herald workflow. Chat approval applies to the proposal for one stage, not to an
entire session.

The Git package glossary listed in `GLOSSARY-MAP.md` is absent in this checkout.
Existing package terms are in `packages/git-integration/CONTEXT.md`. Preserve the
shared provider flow in `docs/adr/0004-use-one-review-request-flow-for-github-and-gitlab.md`
and the package boundaries in `docs/adr/0005-adopt-hexagonal-ddd-architecture.md`.
This spec replaces the dialog-specific requirements in the earlier GIT-002 and
GIT-005 specs if the owner approves it; it does not change those historical files.

## 7. Events and contracts

The existing `/herald`, `/herald commit`, `/herald request`, and `/herald cancel`
commands keep their meanings. The technical plan must identify any new public
interface needed to record or check chat approval and seek owner approval before
implementation.

The current detection uses command text. This change does not guarantee detection
of every way to run Git or a hosting command. Model interpretation of natural
language can also be wrong; tests and conservative handling of unclear replies do
not remove that risk. Other extensions can still ask for their own approvals.

## 8. Open questions

No product decision remains open for the agreed scope. The technical plan must
establish how to check approval and relevant inputs within the existing detection
limits, including commands that read files or calculate values when they run. If
that cannot be done safely, stop and ask the owner before changing code.

## 9. Delivery notes

- **Proposed branch:** `feat/simplify-herald-approval`
- **Commit subject:** `✨ feat(git-integration): simplify Herald approval`
- **Pull request title:** `✨ feat(git-integration): simplify Herald approval`
- **Pull request summary:** Replace duplicate Herald approval dialogs with checked
  chat approval for each stage, while retaining mode limits and detection scope.
- The owner must approve this spec, a technical plan, and implementation tasks
  before code or tests change. This approval does not authorize a branch, commit,
  pull request, or implementation.
