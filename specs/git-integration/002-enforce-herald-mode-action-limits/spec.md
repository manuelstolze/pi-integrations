---
id: GIT-002
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: Manuel Stolze
---

# Enforce Herald mode action limits

## 1. Problem and intent

The Git integration asks for approval before recognized Git actions, but its tool-call guard does not enforce the active Herald mode. For example, commit mode can allow a push after approval. It can also miss `gh pr create` because commit mode has no active hosting provider. Request mode can allow commit actions, and a hosting command can avoid the guard when its CLI does not match the selected provider.

The extension must enforce the action limits of the selected mode and ask the user to approve every allowed recognized action. The approval dialog must show the exact command so the user can see what will run.

## 2. Scope

### In scope

- Enforce the action sets for commit, request, and full mode.
- Detect `git commit`, `git push`, `gh pr create`, and `glab mr create` regardless of the selected provider.
- Block recognized actions that the active mode does not allow.
- Ask for approval before allowed recognized actions and show the exact command in the dialog.
- Block recognized actions when the tool-call context has no user interface.
- Ask for approval for either hosting CLI's review-request command, even when it does not match the detected provider.
- Add tests for the mode/action rules, denied actions, provider mismatch, missing user interface, and exact command display.
- Update Git integration behavior documentation and add a patch Changeset.

### Out of scope

- Guarantee that text-based command checks detect every shell syntax or every way to invoke Git or a hosting service.
- Replace the Bash tool with dedicated Git or hosting tools.
- Change the shared GitHub and GitLab review-request workflow or its accepted architecture decision.
- Change commit, push, or review-request command construction, provider selection, or target-branch rules.

## 3. Requirements

- **FR-001:** The extension MUST retain and enforce the active Herald mode for each agent turn.
- **FR-002:** Commit mode MUST allow `git commit` actions only. It MUST block `git push`, `gh pr create`, and `glab mr create` actions.
- **FR-003:** Request mode MUST allow `git push`, `gh pr create`, and `glab mr create` actions. It MUST block `git commit` actions.
- **FR-004:** Full mode MUST allow `git commit`, `git push`, `gh pr create`, and `glab mr create` actions.
- **FR-005:** The extension MUST detect both hosting CLI request commands regardless of the selected provider. A recognized request command for a different provider MUST still be treated as a review-request action and MUST require approval; provider mismatch alone MUST NOT block it.
- **FR-006:** Before an allowed recognized action runs, the extension MUST ask for approval and show the exact Bash command in the approval dialog.
- **FR-007:** The extension MUST block a recognized action when the tool-call context has no user interface or the user denies approval.
- **FR-008:** If one Bash command contains both an action allowed by the active mode and an action blocked by that mode, the extension MUST block the entire command.
- **FR-009:** The extension MUST clear the active mode and provider state when the agent turn settles, so a later turn does not inherit the previous mode.
- **FR-010:** Tests MUST cover allowed and blocked actions in all three modes, both hosting CLIs, provider mismatch, denied approval, missing user interface, exact command display, state reset, and mixed-action commands.
- **FR-011:** The Git integration context and README MUST describe the mode limits and approval behavior. A patch Changeset MUST record the published behavior fix.

## 4. Capability deltas

- **Modified:** Herald modes enforce their documented action limits. Commit mode no longer permits push or review-request commands. Request mode no longer permits commit commands. Full mode permits all recognized actions.
- **Modified:** Approval dialogs show the exact recognized command rather than only a summary of the action.
- **None:** The review-request flow, provider selection, target-branch rules, and public extension API do not change.

## 5. Acceptance criteria

- Commit mode allows approved commit commands and blocks push and both review-request commands.
- Request mode allows approved push and both review-request commands and blocks commit commands.
- Full mode allows approved commit, push, and both review-request commands.
- A review-request command from either hosting CLI is detected regardless of the selected provider and requires approval.
- A denied action or an action with no user interface is blocked.
- A command that combines allowed and blocked actions is blocked in full.
- The approval dialog displays the exact Bash command.
- Mode and provider state do not carry into a later agent turn.
- Tests cover the required action and failure cases.
- The package README and context describe the mode limits. A patch Changeset is present.
- Existing shared GitHub and GitLab review-request behavior remains unchanged.

## 6. Domain notes

Use the terms and modes in `packages/git-integration/CONTEXT.md`. Commit mode covers commit actions. Request mode covers push and review-request actions. Full mode covers all four recognized action forms.

Preserve accepted ADR-0004, which requires one shared review-request flow for GitHub and GitLab. The provider-specific CLI commands remain within the existing provider boundary. The guard operates on Bash command text and does not promise complete shell command control; strict control through dedicated Git tools is not part of this change.

## 7. Events and API contracts

- No new extension command, event, or public API is added.
- `/herald`, `/herald commit`, and `/herald request` keep their current meanings.
- The published package changes user-visible approval and blocking behavior. Add a patch Changeset for `@manuelstolze/pi-git-integration`.

## 8. Open questions

None. The owner selected the mode/action matrix, fail-closed behavior when the approval UI is missing, and approval (not rejection) for a recognized hosting CLI command that differs from the detected provider.

## 9. Delivery notes

- **Branch:** `fix/git-mode-action-limits`
- **Commit subject:** `🐛 fix(git-integration): enforce Herald mode action limits`
- **Pull request title:** `🐛 fix(git-integration): enforce Herald mode action limits`
- **Pull request summary:** Enforce the action limits for each Herald mode, detect both hosting CLI request commands, and show the exact command before approval.
