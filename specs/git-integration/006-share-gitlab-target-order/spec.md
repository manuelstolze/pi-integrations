---
id: GIT-006
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: '@owner'
---

# Spec GIT-006 — Share the GitLab target branch order

- **Domain:** `git-integration`
- **Status:** Approved by the human owner in the conversation. Planning may start.

## 1. Problem and intent

Herald uses the GitLab target branch fallback order in three places: remote
branch checks, preliminary target selection, and instructions to the agent.
The order is `develop`, then `main`, then `master`. The three uses currently
agree, but a future change could update one without the others.

The intent is to keep one source for this order. The change must not alter
how Herald selects or checks a target branch.

## 2. Scope

### In scope

- Share the GitLab fallback branch order across the three existing uses.
- Preserve concurrent remote branch checks.
- Add or update tests for the shared order and unchanged behavior.

### Out of scope

- Change the fallback order or add target branches.
- Change repository policy precedence or automatically parse repository rules.
- Make the preliminary target the final target without the existing checks.
- Change GitHub target selection, provider detection, approval, or Git actions.
- Change Herald commands, settings, or workflow lifetime.

## 3. Requirements

- **FR-001:** Remote branch checks, preliminary GitLab target selection, and
  Herald instructions MUST use the same source for the fallback branch order.
- **FR-002:** The fallback order MUST remain `develop`, then `main`, then
  `master`. Selection MUST use the first available branch in that order.
- **FR-003:** Remote branch checks MUST remain concurrent. If none of the
  fallback branches is available, the preliminary target MUST remain unknown.
- **FR-004:** A target branch specified by `CONTRIBUTING.md` MUST retain
  priority over the fallback in Herald instructions. The instructions MUST
  continue to require the agent to check the final target and its diff before
  creating a review request.
- **FR-005:** GitHub request preparation MUST continue to use the provider's
  default branch. Commit mode MUST remain independent of hosting access.
- **FR-006:** Existing command meanings, approval checks, public extension
  contract, and failure handling MUST remain unchanged.
- **FR-007:** Tests MUST cover the fallback order, the branch checks, and the
  instructions together. They MUST cover repository policy precedence and an
  unknown preliminary target without claiming that prompt instructions alone
  guarantee agent behavior.

## 4. Capability deltas

**None.** This is an internal refactor. The supported behavior of the Git
integration and its review-request workflow does not change.

## 5. Acceptance criteria

1. Given any combination of available GitLab fallback branches, request
   preparation selects the first available branch in the existing order.
2. Given no available GitLab fallback branch, request preparation reports no
   preliminary target and does not invent a diff base.
3. GitLab request preparation checks all three fallback branches concurrently.
4. Herald's instructions present the same fallback order used by request
   preparation. A test detects disagreement between these uses.
5. The instructions continue to give a target named by `CONTRIBUTING.md`
   priority. They continue to identify the prepared diff as preliminary and
   require a check of the final target and its diff.
6. GitHub request preparation uses its provider's default branch. Commit mode
   does not require hosting access.
7. Existing relevant tests pass. No code change starts until the owner approves
   this spec, a plan, and a task list.

## 6. Domain notes

A **review request** is a GitHub pull request or a GitLab merge request. The
**target branch** receives that request. A preliminary target is used to prepare
an initial diff; it does not override repository rules for the final target.

Follow `docs/adr/0004-use-one-review-request-flow-for-github-and-gitlab.md` and
`docs/adr/0005-adopt-hexagonal-ddd-architecture.md`. The Git package glossary
listed in `GLOSSARY-MAP.md` is absent in this checkout. The existing package
terms are recorded in `packages/git-integration/CONTEXT.md`.

## 7. Events and contracts

No new events or public contracts are required. The `/herald` commands and the
extension's supported entry point remain unchanged. The instructions remain
instructions to an agent, not a guarantee of its final actions.

## 8. Open questions

None for the agreed scope. Implementation details and the test method belong
in the plan.

## 9. Delivery notes

- **Proposed branch:** `refactor/share-gitlab-target-order`
- **Commit subject:** `♻️ refactor(git-integration): share GitLab target order`
- **Pull request title:** `♻️ refactor(git-integration): share GitLab target order`
- **Pull request summary:** Share the GitLab target branch order across remote
  checks, preliminary selection, and Herald instructions without changing
  review-request behavior.
- Spec approval authorizes planning only. No branch, commit, pull request, or
  code change is authorized.
