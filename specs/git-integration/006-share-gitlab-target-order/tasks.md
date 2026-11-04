# Tasks GIT-006 — Share the GitLab target branch order

- **Specification:** [spec.md](spec.md), approved.
- **Plan:** [plan.md](plan.md), approved.
- **Status:** Approved by the human owner in the conversation.
- **Implementation:** Paused at the owner's request. Do not start until the
  owner asks to proceed.

Each task has a checkable result. Record the actual gate result before marking
its checkbox.

## Task list

- [ ] **T01** — Protect the current target branch behavior with tests.
  - Update the Git package's domain, application, and rendering tests first.
    Cover all eight combinations of `develop`, `main`, and `master`; the
    no-target case; all three concurrent checks; and branch-check failures.
  - Check the existing fallback sentence, repository-rule priority, and final
    target and diff instructions. Retain the GitHub default-branch and
    commit-without-hosting checks. Use independent expected branch names.
  - Keep the current domain function contract while testing the baseline.
    Adapt those tests in T02 when its internal contract changes.
  - Gate: `npm test -- --run packages/git-integration/test/domain.test.ts packages/git-integration/test/application.test.ts packages/git-integration/test/rendering.test.ts`.
    The tests must pass against the current behavior. If they reveal a mismatch,
    stop and report it before changing production code.

- [ ] **T02** — Share one GitLab fallback order across all three uses.
  - Update `src/domain/rules.ts` with the internal ordered list and selection
    rule. Derive the concurrent remote checks in
    `src/application/use-cases/prepare-herald-run.ts` from that list. Render
    the fallback sentence from it in `src/interface/pi/render-instructions.ts`.
  - Adapt the domain tests to the internal selection contract. Keep the
    `develop`, `main`, `master` order, existing sentence, errors, no-target
    result, repository-rule priority, and final-diff instructions unchanged.
    Do not add a public extension export.
  - Gate: Run the T01 test command and `npm run typecheck`. Both must pass.
    Inspect the three source files to confirm all uses derive from the same
    ordered list and that all remote checks start before any completes.

- [ ] **T03** — Record the published package change.
  - Add `.changeset/share-gitlab-target-order.md` with a patch release for
    `@manuelstolze/pi-git-integration`. Describe the internal refactor without
    claiming that user-facing behavior changed.
  - Gate: Inspect the Changeset for the package name, patch level, and accurate
    summary. Confirm that no dependency or lockfile change was introduced.

- [ ] **T04** — Verify the completed change and document the results.
  - Run the commands below from the repository root. Record each result here,
    including failed or unrun checks. Review the final diff and untracked
    files for unrelated changes and generated output.
  - Confirm the approved spec has no capability delta. Confirm that the
    existing package context, README, public contract, and ADRs remain correct;
    they need no change for this internal refactor.
  - Gates:

    ```bash
    npm test -- --run packages/git-integration/test
    npm run typecheck
    npm run build
    npm test
    git diff --check
    ```

  - No live GitHub or GitLab operation is needed. Tests use fake dependencies.

## Acceptance coverage

- Fallback order and all branch combinations: T01 and T02.
- No target, concurrent checks, and error handling: T01 and T02.
- Shared source, unchanged instructions, and policy priority: T01 and T02.
- GitHub and commit-mode behavior: T01 and T02.
- Release note, documentation review, and final checks: T03 and T04.

## Delivery

- **Proposed branch:** `refactor/share-gitlab-target-order`
- **Commit subject:** `♻️ refactor(git-integration): share GitLab target order`
- **Pull request title:** `♻️ refactor(git-integration): share GitLab target order`
- **Pull request summary:** Share the GitLab fallback order across checks,
  preliminary selection, and instructions without changing behavior. Include
  verification results and the patch Changeset.

Task approval does not authorize a branch, commit, pull request, or publication.
