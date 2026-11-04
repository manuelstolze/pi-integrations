# Tasks JIRA-004 — Verify issue reads through jira_view

- **Specification:** [spec.md](spec.md), approved.
- **Plan:** [plan.md](plan.md), approved.
- **Status:** Approved by the human owner in the conversation.
- **Implementation:** Paused at the owner's request. Do not start until the
  owner asks to proceed.

Each task has a checkable result. Record the actual gate result before marking
its checkbox. Add one case at a time. These tests describe existing behavior;
an initial failing test is not required. If a case exposes an unexpected
mismatch, stop and report it. Do not change production code under this scope.

The focused gate for T01–T05 is:

```bash
npm test -- --run packages/jira-integration/test/index.test.ts
```

## Task list

- [ ] **T01** — Verify the normal issue read through `jira_view`.
  - Extend `packages/jira-integration/test/index.test.ts`. Register the real
    extension with a fake Pi host and call its `jira_view` tool. Use successful
    fake authentication without account or site details and return a small
    issue with a text description.
  - Assert the returned issue details and tool text. Confirm the result has no
    complete description document. Use a strict fake command runner. Clear or
    stub the Jira credential variables and restore them after the test. Do not
    permit real login, Jira commands, or network access.
  - Gate: Run the focused test command. The new case and existing tests pass.

- [ ] **T02** — Verify the complete description read through `jira_view`.
  - Use the connected extension and fake ACLI results for a successful login
    check, an identifiable active account and site, and an issue with a small
    structured description. Assert the existing text and the full unchanged
    document in the returned result. Keep output short enough to avoid creating
    a temporary output file.
  - Gate: Run the focused test command. The new case and existing tests pass.

- [ ] **T03** — Verify that a complete read rejects an unknown account.
  - Return successful fake authentication status without a usable active
    account or site. Assert that the tool call reports an error.
  - Gate: Run the focused test command. The new case and existing tests pass.

- [ ] **T04** — Verify that a missing stored description is not empty.
  - Return a valid fake account and an issue response with no description
    field. Assert that the complete read reports an error instead of returning
    a known empty value.
  - Gate: Run the focused test command. The new case and existing tests pass.

- [ ] **T05** — Verify cancellation before a read starts.
  - Pass an already-aborted signal to the registered read tool. Assert that the
    call does not succeed and that no fake ACLI command starts. Check that the
    test command records contain no Jira write command.
  - Gate: Run the focused test command. The new case and existing tests pass.

- [ ] **T06** — Verify the test-only change and record results.
  - Run each command below from the repository root. Record passed, failed,
    and unrun checks here. Inspect the final diff and untracked files for
    production source, unrelated changes, credentials, and generated output.
  - Confirm the approved spec has no capability delta. Confirm that the Jira
    README, glossary, public contract, and accepted decisions remain correct.
    No Changeset is needed because the tests are not published and package
    behavior and contents remain unchanged.
  - Gates:

    ```bash
    npm test -- --run packages/jira-integration/test/index.test.ts
    npm test -- --run packages/jira-integration/test
    npm run typecheck
    npm run build
    npm test
    git diff --check
    ```

  - Check new files separately because `git diff --check` omits untracked
    files. No live Jira or manual provider test is needed.

## Acceptance coverage

- Normal and complete reads: T01 and T02.
- Unknown account and missing description: T03 and T04.
- Cancellation and no write: T05.
- Fake access, unchanged production behavior, and final checks: T01–T06.

## Delivery

- **Proposed branch:** `test/verify-jira-issue-reads`
- **Commit subject:** `✅ test(jira-integration): verify issue reads`
- **Pull request title:** `✅ test(jira-integration): verify issue reads`
- **Pull request summary:** Cover normal and complete issue reads through the
  registered `jira_view` tool with fake ACLI access. Preserve Jira behavior.

Task approval does not authorize a branch, commit, pull request, production
refactor, or live Jira operation.
