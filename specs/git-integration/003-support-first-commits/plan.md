# Technical plan: Support first commits in Herald

**Status:** Approved by the owner.

## 1. Approach

Keep the fix inside the Git command adapter at `packages/git-integration/src/infrastructure/git/git-cli-adapter.ts`. Keep Git commands out of the application and domain layers.

The current adapter treats a failed history command as empty history only when its error text contains an English phrase. Replace this text check with checks of Git reference state. A Git reference is a name that points to a commit. In a new repository, `HEAD` names the current branch, but that branch does not yet point to a commit.

Use the following sequence:

1. Retain the existing status, staged diff, unstaged diff, recent history, and branch collection.
2. If `git log --oneline -15` succeeds, return its output without extra reference checks.
3. If the history command fails, use `git symbolic-ref --quiet HEAD` to obtain the full current branch reference. Require a successful result with a nonempty `refs/heads/` name before considering the no-commits case.
4. Check that exact reference with `git show-ref --verify --quiet <branch-ref>`. Interpret only its documented missing-reference result, exit code 1, as a branch with no commits.
5. Return empty recent history only for that state. Do not inspect translated error text.
6. If the branch reference exists, the reference checks fail, or `HEAD` does not name a branch, retain an error. Preserve the original history failure details. Never convert process launch failures or other unknown results into empty history.

Use the existing process runner and its command timeout. Do not use a shell command string, modify references, or change user Git settings. No new dependency is needed.

The existing task renderer already displays `(no commits yet)` for empty history. Keep that behavior and verify it with a test. Do not change application contracts, mode enforcement, hosting adapters, or approval behavior.

## 2. Affected areas

| Path | Planned change |
| --- | --- |
| `packages/git-integration/src/infrastructure/git/git-cli-adapter.ts` | Replace the English error-text check with reference-state checks after a failed history read. Preserve other Git failures. |
| `packages/git-integration/test/adapters.test.ts` | Add language-independent no-commits cases and reference-check failure cases. Retain existing-history coverage and verify command arguments. |
| `packages/git-integration/test/first-commit.test.ts` | Add real temporary-repository tests that exercise the Git adapter, application preparation, and task rendering together. |
| `packages/git-integration/test/application.test.ts` | Verify full-mode preparation with empty history and valid hosting access. Verify required remote and hosting checks still happen before context preparation. |
| `packages/git-integration/test/rendering.test.ts` | Add an explicit empty-history display check if the real-repository test does not already cover it clearly. |
| `packages/git-integration/CONTEXT.md` | Document first-commit support and language-independent handling without changing mode rules. |
| `packages/git-integration/README.md` | Describe first-commit support in commit mode and retain the existing remote requirements. |
| `.changeset/<new-file>.md` | Add a patch Changeset for `@manuelstolze/pi-git-integration`. |

Only add or change a listed test file when it supplies required coverage. Avoid duplicate tests that make the same assertion at the same level.

No public API, repository port, process-runner contract, data migration, or dependency update is planned. Preserve ADR-0003, ADR-0004, and ADR-0005. No new architecture decision is required.

## 3. Test strategy

### Adapter tests with controlled process results

Use the existing fake process runner. Supply results for each Git command, including the reference checks after a failed history read.

Cover:

- The exact reported German history error and the existing English history error, both with a current branch reference that is absent.
- Another error-message text with the same valid reference state, to prove the result does not depend on message wording.
- Successful history reads, with no extra reference commands.
- Failed history reads when the current branch reference exists, including misleading English no-commits text.
- A failed symbolic-reference check, an empty or invalid branch-reference result, and an unexpected reference-check exit code.
- A process launch failure, which must remain an error rather than empty history.
- Required status and diff failures, which must remain errors even when history is absent.
- Preservation of branch, status, and staged and unstaged changes.

### Real temporary repositories

Use Node.js temporary directories and Git subprocesses through the existing `ExecProcessRunner` interface. Bind each runner to its temporary repository. Clean up only directories created by these tests.

Create a repository with `git init`, add and stage a text file, then change that file again. Do not add a remote. Pass the real adapter into `prepareHeraldRun` in commit mode and render the resulting task.

Assert that preparation succeeds, hosting access is not used, the current branch and changes remain available, recent history is empty, and the rendered task says `(no commits yet)`.

Also verify a repository with one existing commit. If a test creates a commit, set its author, committer, and hook settings for that test command only. Do not read or modify the user's identity settings and do not run user hooks. All test commits stay in the temporary directory.

Use controlled process results for the German error case. A German locale installation is not required for automated checks. If a suitable Git translation is available locally, record an additional real-language check without making it a prerequisite.

### Application and safety checks

Verify that full mode accepts empty history after successful hosting validation. Use fake hosting access rather than external services.

Verify missing-origin and failed-hosting cases for full and request modes. These checks must stop before context collection where required by the existing flow.

Run the existing interface tests to confirm request mode still blocks commits, commit mode still blocks pushes and review requests, and required approval remains in place. Do not add a new request-mode workflow or change its failure messages as part of this fix.

## 4. Work sequence

After the owner approves this plan and the implementation tasks:

1. Create the delivery branch without changing or discarding user work.
2. Reproduce the reported failure through the real Git adapter with a controlled German history result. Record the command and failed assertion before changing implementation code.
3. Add the failing regression tests and real-repository coverage.
4. Replace the language-dependent history handling with the reference-state checks.
5. Run the focused tests and verify the real no-commits scenario.
6. Update the package context, README, and patch Changeset.
7. Run repository checks and review the final diff.

No implementation or test changes may start before all three specification artifacts are approved.

## 5. Verification gates

Run from the repository root:

```bash
npm test -- packages/git-integration/test/adapters.test.ts packages/git-integration/test/first-commit.test.ts
npm test -- packages/git-integration/test
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
npm run build
npm test
git diff --check
```

Acceptance gates:

- The controlled German regression fails before the fix and passes after it.
- A real repository with no commits prepares commit mode without a remote or hosting access.
- Available repository context is preserved and empty history is stated explicitly.
- Existing history remains available. Real Git and reference-check failures remain errors.
- Full and request mode requirements, mode limits, and approval behavior remain unchanged.
- Package documentation and the patch Changeset describe the published fix.
- Record each validation command and result. Report unrelated or environment failures separately.
- No generated build output, credentials, user settings, or unrelated changes enter the final diff.

Do not replace the installed dependency tree to repair a blocked check without discussing that action with the owner.

## 6. Risks and constraints

- A failed `HEAD` lookup alone does not prove that a repository has no commits. Require the current branch reference and its documented missing-reference result.
- Git output language is not a reliable state check. Do not use English or German message matching in the fix.
- Keep reference checks limited to failed history reads so normal repositories do not pay for extra Git commands.
- Git state can change while context is collected. This fix does not promise an atomic repository snapshot or add locking.
- Real-repository tests must not depend on the user's default branch name, Git identity, installed translations, or hosting credentials.
- A clean repository with no files retains its existing handling. Untracked file-content display is outside this change.

## 7. Delivery notes

- **Branch:** `fix/herald-first-commit`
- **Commit subject:** `🐛 fix(git-integration): support first commits in Herald`
- **Pull request title:** `🐛 fix(git-integration): support first commits in Herald`
- **Pull request summary:** Support repositories with no commits without depending on Git error-message language. Preserve real Git failures, mode limits, remote requirements, and approval rules.
