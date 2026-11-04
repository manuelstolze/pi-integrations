# Technical plan: Share the GitLab target branch order

## 1. Status and approval

- **Specification:** [spec.md](spec.md), approved by the human owner in the
  conversation.
- **Plan status:** Approved by the human owner in the conversation.
- **Task breakdown:** [tasks.md](tasks.md), approved by the human owner.
- **Implementation:** Paused until the owner asks to proceed.
- Implementation requires approved `spec.md`, `plan.md`, and `tasks.md`.

## 2. Context and evidence

### Observed

- `packages/git-integration/src/domain/rules.ts` selects from three named
  GitLab branches. Its domain tests cover the existing order.
- `packages/git-integration/src/application/use-cases/prepare-herald-run.ts`
  checks the three `origin` branches concurrently and prepares a preliminary
  diff. It uses GitHub's default branch for GitHub requests.
- `packages/git-integration/src/interface/pi/render-instructions.ts` repeats
  the order in instructions. It gives `CONTRIBUTING.md` priority and tells the
  agent to inspect the final target and diff.
- The package's existing application and rendering tests cover parts of this
  behavior. They do not establish that one source drives all three uses.
- No test command has been run for this plan. No mismatch between the current
  order statements was found during source inspection.

### Context and decisions

Read `GLOSSARY-MAP.md`, root `GLOSSARY.md`, `CONTRIBUTING.md`, the Git package
README, and `packages/git-integration/CONTEXT.md`. The Git package glossary
named in `GLOSSARY-MAP.md` is absent in this checkout. `CONTEXT.md` supplies
the existing Git terms for this plan.

Keep ADR-0004's repository-rule precedence and provider behavior. Keep
ADR-0005's inward dependencies and package structure. No accepted decision
needs to change.

## 3. Technical approach and boundaries

1. In `src/domain/rules.ts`, define one internal, ordered, read-only list of
   GitLab fallback branch names. Keep the existing domain selection function,
   but make it select the first listed branch present in a collection of
   available branch names. The list is internal to the package, not a new
   supported export from its entry point.
2. In `src/application/use-cases/prepare-herald-run.ts`, derive the GitLab
   `origin/<branch>` checks from the shared list. Start all checks together
   with `Promise.all`. Pass the available names to the domain selection
   function. Keep the existing no-target result and diff error handling.
   Preserve propagation of a failed branch check.
3. In `src/interface/pi/render-instructions.ts`, derive the GitLab fallback
   sentence from the same list. Preserve its current wording and branch order.
   Keep the repository-policy and final-diff instructions unchanged.
4. Keep GitHub preparation, commit mode, Pi commands, approval checks, and
   provider adapters unchanged. No new dependency, configuration, migration,
   or public contract is needed.

The domain module owns the branch order and selection rule. The application
module owns remote checks and preliminary diff preparation. The Pi module owns
the instructions. These imports preserve the existing inward dependency rule.
The agent remains responsible for following the instructions; the refactor
does not enforce the final target through code.

## 4. Affected files

| Path | Planned change | Requirement |
| --- | --- | --- |
| `packages/git-integration/src/domain/rules.ts` | Share the ordered names and select from available names. | FR-001, FR-002 |
| `packages/git-integration/src/application/use-cases/prepare-herald-run.ts` | Derive concurrent checks from that order. | FR-001, FR-003 |
| `packages/git-integration/src/interface/pi/render-instructions.ts` | Render the fallback from the shared order. | FR-001, FR-004 |
| `packages/git-integration/test/domain.test.ts` | Cover selection for all availability combinations. | FR-002, FR-003 |
| `packages/git-integration/test/application.test.ts` | Cover checks, concurrent start, target selection, failures, GitHub, and commit mode. | FR-002, FR-003, FR-005, FR-006 |
| `packages/git-integration/test/rendering.test.ts` | Cover shared order and unchanged policy instructions. | FR-001, FR-004 |
| `.changeset/share-gitlab-target-order.md` | Record a patch release for the published package. | Release rule |

## 5. Documentation and release impact

| Artifact | Impact |
| --- | --- |
| Package README and public contract documentation | No update. User-facing behavior and commands stay unchanged. |
| Root glossary, package context, and glossary map | No term or context relationship changes. The missing Git glossary is outside this refactor. |
| ADRs and repository rules | No update. Existing decisions remain in force. |
| Changeset | Add a patch Changeset for `@manuelstolze/pi-git-integration`. The published package implementation changes. |
| Dependencies and lockfile | No changes. |

A Changeset is a release note that identifies the package and version increase.

## 6. Verification strategy and acceptance gates

| Spec criterion | Test or check | Required result |
| --- | --- | --- |
| 1 | Domain and application tests cover all eight combinations of three branch names. | The earliest available branch wins. |
| 2 | Application test makes all checks return false and records diff calls. | Target is unknown and no diff is requested. |
| 3 | Application test holds each check on a separate pending promise. | All three checks start before any promise is resolved. Release all promises even on test failure. |
| 4 | Rendering and application tests compare the rendered order and checked names against an independent expected order. | Both match `develop`, `main`, `master`; a change to only one use fails a test. |
| 5 | Rendering test checks policy precedence, preliminary diff, and final target/diff instructions. | Required instructions remain present. |
| 6 | Application tests cover GitHub's default branch and commit mode without hosting access. | Existing results and calls remain unchanged. |
| 7 | Run package and repository checks after all approvals. | Report actual results for each command. |

Also test that a failed remote branch check is still propagated. Check that the
rendered fallback sentence retains its current wording. These checks use fake
Git and hosting dependencies. They do not run commits, pushes, or live GitHub
or GitLab calls. Prompt assertions do not prove agent compliance.

After implementation, run from the repository root:

```bash
npm test -- --run packages/git-integration/test
npm run typecheck
npm run build
npm test
git diff --check
```

Record actual results in `tasks.md`. Report failed and unrun checks separately.
No manual live-provider check is required for this internal refactor.

## 7. Work sequence, risks, and open points

After all three approval gates:

1. Update tests for the shared rule and preserved behavior.
2. Apply the small domain, application, and instruction changes.
3. Add the Changeset and run the checks above. Review the final diff.

| Risk | Check |
| --- | --- |
| A sequential check changes timing. | Hold all fake checks pending and verify that each starts before release. |
| Tests repeat the same mistake as the implementation. | Assert the approved order independently, including every availability combination. |
| Generated instructions change or weaken policy precedence. | Assert the existing sentence and policy/final-diff instructions. |
| A branch check error or missing branch changes meaning. | Test error propagation and the no-target result. |

No dependency installation, configuration change, or irreversible action is
needed. If a guardrail or the approved scope blocks the work, stop and ask the
owner instead of adding a workaround.

## 8. Delivery and approval checkpoint

- **Proposed branch:** `refactor/share-gitlab-target-order`
- **Proposed commit subject:** `♻️ refactor(git-integration): share GitLab target order`
- **Pull request title:** `♻️ refactor(git-integration): share GitLab target order`
- **Pull request summary:** Share the GitLab fallback order across checks,
  preliminary selection, and instructions. Preserve behavior and report the
  verification results and patch Changeset.
- **Existing work to preserve:** The approved `spec.md` in this directory.
- **Owner decision needed:** Ask to proceed before implementation starts.

Plan approval does not authorize implementation, a branch, a commit, a pull
request, or publication. Code changes still require an approved task list.
