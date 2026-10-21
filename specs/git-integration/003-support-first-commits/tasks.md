# Support first commits in Herald: Tasks

**Status:** Approved by the owner.

The owner approved `spec.md`, `plan.md`, and this task list. Task checkboxes record completed acceptance gates.

## Implementation tasks

- [x] **T01** — Reproduce the reported failure with a test in `packages/git-integration/test/adapters.test.ts`. Start work on `fix/herald-first-commit` after checking for user changes. Supply the exact reported German history error through the fake process runner and exercise the real `GitCliAdapter.snapshot()` method. Assert that a valid repository with no commits returns empty history and preserves its available context. **Acceptance gate:** run `npm test -- packages/git-integration/test/adapters.test.ts` before changing implementation code. Record the command and the failed German-case assertion. The failure must come from the reported history error, not from test setup.

- [x] **T02** — Replace the English error-text check in `packages/git-integration/src/infrastructure/git/git-cli-adapter.ts`. After a failed history read, require a successful `git symbolic-ref --quiet HEAD` result that names a nonempty `refs/heads/` reference. Check that exact reference with `git show-ref --verify --quiet <branch-ref>`. Treat only exit code 1 from that reference check as missing history. Preserve the original history error for other states. Extend `packages/git-integration/test/adapters.test.ts` to cover German, English, and unrelated message text; successful existing history; existing references after history failures; failed or invalid symbolic-reference checks; unexpected reference-check results; process launch failures; and required status and diff failures. **Acceptance gate:** all adapter tests pass. A successful history read issues no extra reference commands. Missing history preserves branch and change information. Real failures remain errors, even when the error text contains the old English phrase. No application contract, dependency, or approval rule changes.

- [x] **T03** — Add `packages/git-integration/test/first-commit.test.ts` with real temporary repositories. Connect the Git adapter through `ExecProcessRunner` to `prepareHeraldRun`, then render the prepared task. Create a repository with no remote, stage a text file, and change it again before preparation. Verify a second repository with one existing commit. Keep test identity and hook settings local to test commands. Clean up only directories created by the tests. **Acceptance gate:** run `npm test -- packages/git-integration/test/first-commit.test.ts`. Commit mode succeeds without hosting access in the no-commits repository, retains branch and staged and unstaged changes, and renders `(no commits yet)`. The repository with a commit retains its recent history. Tests do not depend on a specific default branch, user identity, hosting credentials, or installed translations. Add a separate check in `packages/git-integration/test/rendering.test.ts` only if this test does not clearly cover the empty-history display.

- [x] **T04** — Extend `packages/git-integration/test/application.test.ts` to verify full-mode preparation with empty history after successful hosting validation. Cover missing-origin and failed-hosting cases in full and request modes. Confirm that those failures stop before context collection. Run the existing mode and approval checks in `packages/git-integration/test/pi-adapter.test.ts`. **Acceptance gate:** run `npm test -- packages/git-integration/test/application.test.ts packages/git-integration/test/pi-adapter.test.ts`. Full mode accepts empty history with valid hosting access. Full and request modes retain their remote and hosting requirements. Request mode still blocks commits, commit mode still blocks pushes and review requests, and required approval remains in place. No external hosting service is contacted.

- [x] **T05** — Update `packages/git-integration/CONTEXT.md` and `packages/git-integration/README.md` to describe first-commit support and language-independent history handling. Retain the documented remote requirements, mode limits, and approval rules. Add `.changeset/herald-first-commit.md` for `@manuelstolze/pi-git-integration` with a patch version update. **Acceptance gate:** both documents match the approved specification. The Changeset names the correct package and uses `patch`. ADR-0003, ADR-0004, ADR-0005, and the public extension API remain unchanged.

- [x] **T06** — Run the validation commands below and review the final diff. Report results in the conversation and include them in the pull request description. Update task checkboxes only when their acceptance gates are met. **Acceptance gate:** record each command, result, and any remaining limit. Confirm that the German regression failed before the fix and passed after it. Distinguish unrelated failures from failures caused by this change. Do not replace the installed dependency tree without owner approval. Confirm that only the approved package fix, tests, documentation, Changeset, and specification artifacts are included. Do not include generated output, credentials, or user configuration.

## Validation commands

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

If a Git installation with German messages is available, record an additional real-language check. This is optional because the controlled German regression is mandatory and must not depend on installed translations.

## Delivery

- **Branch:** `fix/herald-first-commit`
- **Commit subject:** `🐛 fix(git-integration): support first commits in Herald`
- **Pull request title:** `🐛 fix(git-integration): support first commits in Herald`
- **Pull request summary:** Support repositories with no commits without depending on Git error-message language. Preserve real Git failures, mode limits, remote requirements, and approval rules.
