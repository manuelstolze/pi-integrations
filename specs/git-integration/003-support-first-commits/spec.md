---
id: GIT-003
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: Manuel Stolze
---

# Support first commits in Herald

## 1. Problem and intent

The owner reports that Herald fails in a repository created with `git init` when no commits exist. Git returns a German error from `git log --oneline -15`. Herald reports that it could not collect Git context and stops.

Herald must support preparing the first commit. A repository with no commits is a valid starting state, not a Git context failure. This behavior must not depend on the language of Git error messages.

At specification approval, the failure had not yet been reproduced locally. Include implementation results and validation limits in the pull request description.

## 2. Scope

### In scope

- Allow commit mode to prepare the first commit in a repository with changes and no commit history.
- Keep available branch, status, staged-change, and unstaged-change information.
- State that no commits exist when presenting repository context.
- Handle missing history without depending on Git error-message language.
- Preserve real Git failures as errors.
- Preserve the remote requirements, mode limits, and approval rules.
- Add tests, update package behavior documentation, and add a patch Changeset. A Changeset records the published package change and required version update.

### Out of scope

- Create an initial commit automatically or bypass approval.
- Change full mode to offer or select commit-only mode when a remote is unavailable.
- Remove the remote or hosting-access requirements for full or request mode.
- Add first-commit creation to request mode.
- Change Git hosting-provider selection, target-branch rules, or the shared review-request flow.
- Change how Herald displays untracked file contents or handles a repository with no changes.
- Repair damaged repositories or change user Git configuration.

## 3. Requirements

- **FR-001:** `/herald commit` MUST prepare the commit workflow in a valid repository with changes and no commits. Missing history alone MUST NOT cause a Git context error.
- **FR-002:** The prepared context MUST retain available branch, status, staged-change, and unstaged-change information when no commits exist.
- **FR-003:** The context presented to the agent MUST state that no commits exist. It MUST NOT invent commit history.
- **FR-004:** Recognition of the no-commits state MUST NOT depend on the language or exact wording of Git error messages.
- **FR-005:** Git failures other than the valid no-commits state MUST remain errors. A history failure in a repository with existing commits MUST NOT be presented as empty history.
- **FR-006:** Commit mode MUST continue to work without an `origin` remote or hosting access. Full and request modes MUST retain their existing remote and hosting-access requirements. The full flow MUST still validate those requirements before creating commits.
- **FR-007:** Full mode MUST NOT fail context collection solely because no commits exist, provided its existing remote and hosting-access requirements are met.
- **FR-008:** Request mode MUST remain limited to existing commits. This change MUST NOT permit request mode to create the first commit.
- **FR-009:** Existing mode limits and approval requirements MUST remain unchanged. No permanent Git action may run without the required user approval.
- **FR-010:** Tests MUST cover the reported German no-commits case, the English no-commits case, repositories with existing history, and real Git failures. Verification MUST include a real repository created with `git init` and no commits.
- **FR-011:** Package documentation MUST describe first-commit support and unchanged mode requirements. A patch Changeset MUST record the behavior fix for `@manuelstolze/pi-git-integration`.

## 4. Capability deltas

- **Modified:** Herald can prepare the first commit even when Git reports missing history in a language other than English.
- **Modified:** Missing commit history is treated as a valid repository state, while real Git failures remain errors.
- **None:** Command names, mode action limits, approval rules, remote requirements, provider selection, and review-request rules do not change.

## 5. Acceptance criteria

1. Given a repository created with `git init`, files to commit, and no remote, `/herald commit` prepares the first-commit workflow without a Git context error.
2. The prepared context includes available branch and change information and states that no commits exist.
3. The reported German Git message does not cause Herald to reject a valid no-commits repository. The same result holds for English Git output.
4. A repository with existing commits still provides its recent history.
5. A genuine history-read failure in a repository with commits remains an error. Failures while reading other required repository context also remain errors.
6. Full mode with valid hosting access and an origin remote can prepare context before the first commit. Full and request modes without their required remote or hosting access still stop under the existing rules.
7. Request mode cannot create a first commit. Commit mode still blocks push and review-request actions.
8. Required approval remains in place before permanent Git actions.
9. Tests include a real no-commits repository and checks for the reported language-dependent failure.
10. Package documentation describes the supported behavior. A patch Changeset is present.

## 6. Domain notes

Use the terms in `packages/git-integration/CONTEXT.md`.

A repository with no commits has no commit history yet. This does not mean that its Git commands are generally allowed to fail.

Preserve ADR-0003: full and request modes require a usable origin remote and hosting access. Commit mode does not require either.

Preserve ADR-0004: GitHub and GitLab use one shared review-request flow. This fix does not change that flow.

## 7. Events and API contracts

- No new extension command, event, or public API is required.
- `/herald`, `/herald commit`, and `/herald request` retain their current meanings.
- Existing repository and hosting-provider boundaries remain unchanged.
- The published behavior fix requires a patch Changeset for `@manuelstolze/pi-git-integration`.

## 8. Open questions

None. The owner confirmed first-commit support, unchanged remote requirements, preserved real Git errors, unchanged request-mode limits, and retained approval requirements.

## 9. Delivery notes

- **Branch:** `fix/herald-first-commit`
- **Commit subject:** `🐛 fix(git-integration): support first commits in Herald`
- **Pull request title:** `🐛 fix(git-integration): support first commits in Herald`
- **Pull request summary:** Support repositories with no commits without depending on Git error-message language. Preserve real Git failures, mode limits, remote requirements, and approval rules.
