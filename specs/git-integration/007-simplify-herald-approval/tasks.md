# Tasks GIT-007 — Simplify Herald approval

- **Specification:** [spec.md](./spec.md), approved by the owner in the conversation.
- **Plan:** [plan.md](./plan.md), approved by the owner in the conversation.
- **Task list:** Approved by the owner in the conversation. The owner asked to
  wait for a separate implementation request.

Do not change code or tests until the owner requests implementation. Each task has a
check that must pass before its checkbox is marked. Record actual check results
and any unrun checks here. Do not create real commits, push, create review
requests, replace dependencies, or change personal settings as part of testing.

## Task list

- [ ] **T01** — Verify the Pi 1.3.0 proposal and reply sequence with a minimal
  fake extension in a supported-host test. Cover full visible proposal delivery,
  a later human reply, session identity, extension-generated messages, and input
  queued before the proposal is shown. This host check must not depend on the
  production approval tools from later tasks. Record whether the proposed tools
  and message order can meet the plan. Stop and ask the owner if they cannot.
  - Gate: `npm test -- --run packages/git-integration/test/supported-host.test.ts`
    passes the new host checks without a real Git or hosting action.

- [ ] **T02** — Add and test stage approval rules. Bind each proposal to its run
  and session. Track replies, approval, ordered commands, one attempt per command,
  stage completion, proposal replacement, and invalidation. Do not treat a model
  report as independent proof that its interpretation is correct.
  - Gate: `npm test -- --run packages/git-integration/test/domain.test.ts`
    passes tests for approval, invalidation, stale identities, and attempt limits.

- [ ] **T03** — Add and test capability-specific proposal and input-check
  contracts. Support checkable commit and request proposals without exposing a
  generic command runner to the application. Reject missing or unsupported data.
  - Gate: `npm test -- --run packages/git-integration/test/application.test.ts`
    passes tests for both stages, invalid proposals, failed checks, and mode rules.

- [ ] **T04** — Add Git input checks for approved commit content and supported
  canonical commit commands. Cover staged, unstaged, added, deleted, binary, and
  partially staged content. Check each commit in a multi-commit plan against its
  expected state. Investigate the example `rtk git add` plus `rtk git commit`
  form; support it only if its effects can be checked. Block unsupported forms.
  - Gate: `npm test -- --run packages/git-integration/test/adapters.test.ts`
    and any new Git input-check test file pass against temporary repositories.
    No command changes the working repository's Git history.

- [ ] **T05** — Add request input checks for supported push and GitHub or GitLab
  request commands. Check explicit source and target values and the approved
  title and description, including file bytes when a file is used. Retain the
  existing duplicate-request and provider rules.
  - Gate: `npm test -- --run packages/git-integration/test/adapters.test.ts`
    and any new request input-check test file pass with fake providers and no
    network access.

- [ ] **T06** — Add model-only proposal and reply-report tools. Generate and show
  the complete proposal from the same structured data used by the check. Bind the
  report to an actual later user reply and the current proposal. Reject stale or
  missing replies, denied and unclear reports, and extension-generated input.
  Update Herald instructions for the new flow.
  - Gate: `npm test -- --run packages/git-integration/test/rendering.test.ts packages/git-integration/test/pi-adapter.test.ts`
    passes rendering, reply binding, invalid proposal, and tool activation tests.

- [ ] **T07** — Replace Herald's dialog for detected actions with checks of the
  current approved command and inputs. Preserve the mode matrix, mixed-command
  blocking, no-UI behavior, and session boundaries. Reserve an attempt before
  dispatch; block duplicate or parallel use and process late or failed tool
  results safely.
  - Gate: `npm test -- --run packages/git-integration/test/pi-adapter.test.ts`
    passes the mode matrix, exact-match, no-dialog, changed-input, no-approval,
    one-attempt, parallel-call, failure, and cleanup tests.

- [ ] **T08** — Cover the complete two-stage flow on the supported host. Test
  multi-commit approval, separate request approval, both providers, revised plans,
  changed inputs, retry after failure, partial work, cancellation, reload, and
  session replacement. Keep model restoration and existing failure rules intact.
  - Gate: `npm test -- --run packages/git-integration/test/supported-host.test.ts`
    passes with fake Bash and hosting actions and verifies no Herald dialog.

- [ ] **T09** — Update the living behavior rules in
  `packages/git-integration/README.md` and `packages/git-integration/CONTEXT.md`.
  Describe supported command forms, both approval stages, cleanup, and the limits
  of model interpretation and pre-execution checks. Keep GIT-002 and GIT-005 as
  historical specs; GIT-007 records the changed capability. No glossary term,
  context relationship, or accepted ADR changes under the approved plan. If an
  implementation needs such a change, stop and follow the applicable guidance.
  - Gate: Review the two rule documents and model-facing tool descriptions
    against all GIT-007 requirements. Confirm that no current rule still says a
    Herald command dialog is required after chat approval.

- [ ] **T10** — Add `.changeset/simplify-herald-approval.md` for a patch release
  of `@manuelstolze/pi-git-integration`. Document the behavior change without
  claiming that command detection or natural-language interpretation is complete.
  - Gate: Inspect the Changeset front matter and text. Confirm the package name
    and version bump match the approved plan.

- [ ] **T11** — Run the complete validation set and review the final diff. Record
  each result below. Investigate failures without hiding unrelated failures.
  - Gate: Run `npm test -- --run packages/git-integration/test`,
    `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check`.
    Review untracked files as well as tracked diffs. Report failed and unrun
    checks separately.

## Validation results

Not run. Implementation has not started.

## Risks and stopping points

- A workflow model can misread a reply or incorrectly report approval. Binding
  its report to a real reply does not remove that risk.
- The guard checks inputs before execution. External processes, hooks, and later
  extension handlers can still change inputs after the check. The guard does not
  detect every indirect command.
- Stop and ask the owner if the host cannot bind a displayed proposal to a later
  reply, if a supported command cannot meet the spec's input checks, or if work
  requires a guardrail exception or a new dependency.
- Other extensions can still request their own approvals.

## Delivery

- **Proposed branch:** `feat/simplify-herald-approval`
- **Commit subject:** `✨ feat(git-integration): simplify Herald approval`
- **Pull request title:** `✨ feat(git-integration): simplify Herald approval`
- **Pull request summary:** Replace duplicate Herald dialogs with checked chat
  approval for each stage. Keep mode limits and document the remaining risks.
- **Approval gate:** The owner approved this task list but did not authorize
  implementation yet. A separate request is required before code or tests change.
  Approval does not authorize Git history changes or publication.
