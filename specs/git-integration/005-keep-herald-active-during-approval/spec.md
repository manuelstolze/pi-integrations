---
id: GIT-005
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: Manuel Stolze
---

# Keep Herald active during chat approval

## 1. Problem and intent

The owner reports that Herald selects its configured model, proposes a commit,
and switches back to another model before the owner replies. The owner confirmed
that the approval request is a question in chat, not a command approval dialog.

Herald must remain active while it waits for a reply. Finishing one answer is
not the same as finishing the requested Git workflow.

The owner approved this specification in the conversation. Planning may start.
Code and test changes still require approval of the plan and tasks.

Current code in `packages/git-integration/src/interface/pi/extension.ts` restores
the chat selections and clears the active mode on every `agent_settled` event.
This event means that Pi will not continue automatically. It does not state
whether the requested Git workflow is complete.

The existing interface and supported-host tests pass, but they do not exercise
a commit proposal followed by approval in a later user message. A reproduction
that checks this exact sequence is still required. No code or test changes may
start before the owner approves this specification, the plan, and the tasks.

## 2. Scope

### In scope

- Keep Herald active across chat questions and user replies within one workflow.
- Keep temporary model and thinking selections until that workflow ends.
- Keep Herald instructions, mode limits, and command approval checks active.
- Restore chat selections when the workflow ends or is cancelled.
- Test the reported sequence and document the corrected behavior.
- Add a patch Changeset. A Changeset records a published package change.

### Out of scope

- Change Herald settings, command modes, or Git hosting selection.
- Remove or weaken command approval dialogs.
- Treat a chat approval as permission to skip command approval.
- Change Pi itself or create a separate agent session.
- Write personal settings or credentials.

## 3. Requirements

- **FR-001:** A chat question that waits for the owner's reply MUST NOT, by itself, end the Herald workflow.
- **FR-002:** Herald MUST retain its usable configured model and thinking level across these questions and replies. The existing rules for manual selections MUST remain in force.
- **FR-003:** Herald instructions, mode limits, and command approval checks MUST remain active across these questions and replies, including when no Herald model settings exist.
- **FR-004:** Herald MUST restore the previous chat selections after the requested workflow completes, fails terminally, or is cancelled. A recoverable problem followed by a question MUST NOT count as terminal failure.
- **FR-005:** Ending a workflow MUST NOT depend only on the end of a single Pi answer. Completion MUST be distinguishable from waiting for a user reply.
- **FR-006:** Cancellation, failed starts, extension reload, and session replacement MUST retain their existing cleanup guarantees. The owner MUST have a documented way to leave an unfinished workflow without performing a Git action.
- **FR-007:** Existing manual model and thinking choices MUST remain protected. Settings files MUST remain unchanged.
- **FR-008:** Another Herald command MUST NOT silently replace an unfinished workflow. The owner MUST receive clear guidance if a new run cannot start.
- **FR-009:** Existing mode limits and exact-command approval dialogs MUST remain unchanged. A chat reply MUST NOT bypass these dialogs.
- **FR-010:** Tests MUST cover approval across separate user messages, workflow completion, cancellation while waiting for a reply, manual selections, and unchanged behavior without model settings.
- **FR-011:** The package README and context MUST describe the workflow lifetime and how to leave an unfinished workflow. A patch Changeset MUST name `@manuelstolze/pi-git-integration`.

## 4. Capability deltas

- **Modified:** Herald remains active across multiple user messages until the workflow ends.
- **Modified:** Model restoration follows workflow completion rather than the end of each Pi answer.
- **Modified:** Mode checks and Herald instructions remain active while the owner reviews a proposal in chat.
- **None:** Command meanings, settings precedence, hosting selection, and required command approvals do not change.

## 5. Acceptance criteria

1. Start `/herald commit` with a configured model and thinking level. Let Herald propose a commit and ask for approval in chat. Both selections remain active while waiting for the reply.
2. Reply with approval. The next Herald model request uses the same selections unless the owner manually changed them. The Git command still requires its existing approval dialog.
3. Repeat the waiting-and-reply sequence for full and request modes. The relevant mode limits remain active throughout.
4. Without model settings, a chat question does not clear mode checks or Herald instructions.
5. Complete the workflow. The previous chat selections return, subject to the existing rules for manual selections. A later unrelated chat message has no active Herald mode.
6. Leave or cancel a workflow while it waits for a reply. Chat selections return and another Herald run can start.
7. Reload or replace the session while waiting for a reply. Temporary selections and active workflow state do not carry over.
8. A recoverable failure followed by a question retains Herald state. A terminal failure restores chat selections.
9. A repeated Herald command cannot silently replace a waiting workflow.
10. Run a test that fails on the reported sequence before applying the fix. Run it again after the fix. Run the relevant package checks and report their results.

## 6. Domain notes

Use the terms in `packages/git-integration/CONTEXT.md`.
A Herald workflow can contain multiple Pi answers and user replies.
A command approval dialog is separate from approval of a proposal in chat.
Preserve ADR-0003, ADR-0004, and ADR-0005.

## 7. Events and contracts

The existing `agent_settled` event identifies the end of automatic Pi activity,
not necessarily the end of a Herald workflow. This fix must respect that event's
contract without treating every pause as workflow completion.

Existing settings, Git repository interfaces, and hosting interfaces stay unchanged.
The plan must verify a supported way to identify workflow completion and leave
an unfinished workflow. If this requires a new user command or another public
interface, obtain the owner's approval before implementation.

## 8. Open questions

No unresolved question about the reported switch point. The owner confirmed that
the model switches after a question in chat, before the owner replies.
Completion detection and the supported way to leave an unfinished workflow must
be resolved in the technical plan and approved before implementation.

## 9. Delivery notes

- **Proposed branch:** `fix/keep-herald-active-during-approval`
- **Commit subject:** `🐛 fix(git-integration): keep Herald active during approval`
- **Pull request title:** `🐛 fix(git-integration): keep Herald active during approval`
- **Pull request summary:** Keep Herald selections, instructions, and mode checks active while waiting for chat approval. Restore chat selections when the workflow ends.
- **Approval gate:** The owner must approve this specification, the technical plan, and the implementation tasks before code or test changes.
