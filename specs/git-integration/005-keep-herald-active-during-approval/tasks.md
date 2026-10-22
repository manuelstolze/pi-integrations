# Implementation tasks: Keep Herald active during chat approval

**Status:** Approved by the owner in the conversation. All implementation tasks are complete.
Validation results and limits are recorded below.

## 1. Execution rules

- Start code and test changes only after the owner approves this file.
- Complete tasks in order. Keep each checkbox unchecked until its acceptance gate passes.
- Record actual commands and results in section 4. Distinguish expected failing tests from other failures.
- Keep behavior changes in `packages/git-integration`. Only workspace dependency metadata, the Changeset, and these delivery records belong outside the package.
- Preserve mode limits, exact-command approval dialogs, hosting rules, and manual model selections.
- Do not edit personal settings, credentials, or generated files. Do not replace the installed dependency tree without separate approval.
- Use the supported Pi interfaces named in the plan. Stop and ask if they cannot meet an approved requirement.
- Do not commit, push, publish, or create a pull request without an owner request.

## 2. Ordered tasks

- [x] **T01** — Reproduce the model switch before changing production code.
  - **Files and area:** Working tree and `packages/git-integration/test/pi-adapter.test.ts`.
  - Check branch and working-tree state. Create `fix/keep-herald-active-during-approval` without discarding existing work or the specification files. Stop if a branch conflict needs an owner decision.
  - Add a test through `registerGitIntegration()` using the existing configured test host. Start Herald, simulate a chat proposal, emit `agent_settled` with `aborted: false`, and assert that the Herald model and thinking level remain selected.
  - Include the later approval reply and its retained instructions in the intended sequence. Retain the test after the fix.
  - Do not add the finish tool to the fake host before recording this failure. The failure must show premature restoration, not an absent proposed API.
  - **Acceptance gate:** Run `npm test -- packages/git-integration/test/pi-adapter.test.ts`. Record the failing test name and assertion showing the chat model where the Herald model was expected. Do not proceed if the test fails for another reason.

- [x] **T02** — Keep Herald active across replies and end it through an explicit result.
  - **Depends on:** T01.
  - **Files:** `packages/git-integration/src/interface/pi/extension.ts`, `packages/git-integration/test/helpers/pi-harness.ts`, `packages/git-integration/test/pi-adapter.test.ts`, `packages/git-integration/package.json`, and `package-lock.json`.
  - Add the Pi AI peer dependency `>=1.3.0 <2` and development dependency `^1.3.0` for `Type`. Synchronize the lockfile without unrelated dependency upgrades.
  - Extend the fake host to register and call tools, track active tool names, and record status changes.
  - Retain instructions in the active workflow. Add them to each incoming `before_agent_start` prompt without accumulating copies.
  - Register `herald_finish` with the approved schema, model-only exposure, inactive default, and sequential execution. A model-only tool can be called directly by the model, but not through another tool.
  - Record its result without restoring selections inside tool execution. Keep ordinary settlement active unless the workflow has a reported result.
  - Activate only the finish tool required by Herald. Remove only Herald-owned activation during cleanup. Preserve unrelated tool changes and prior owner activation.
  - Keep `HeraldModelController` as the single owner of temporary model and thinking selections. Do not reapply settings on replies.
  - Update existing completion tests to report a workflow result before expecting restoration. Do not weaken cancellation or failed-start checks.
  - **Acceptance gate:** The T01 test passes. Interface tests pass for each mode across question, settlement, reply, finish report, final settlement, and restoration. The final summary retains the Herald selections until settlement. Tests verify instruction removal after cleanup and active-tool preservation. `npm run typecheck` passes.

- [x] **T03** — Preserve action checks throughout approval and completion.
  - **Depends on:** T02.
  - **Files:** `packages/git-integration/src/interface/pi/extension.ts` and `packages/git-integration/test/pi-adapter.test.ts`.
  - Test all mode limits after a chat pause and approval reply, with and without Herald model settings.
  - Keep exact-command dialogs for every recognized allowed mutation. A chat approval must not replace a dialog.
  - After a finish report, block further recognized Git mutations until cleanup. Keep read-only calls available for the final summary.
  - Reject finish calls without an active current-session workflow. Make repeated calls safe without repeated restoration.
  - Show active Herald status. Reject overlapping starts with clear completion and `/herald cancel` guidance.
  - **Acceptance gate:** Interface tests pass for allowed, denied, mixed, and no-UI actions after a pause; all finish statuses; inactive and wrong-session calls; repeated finish calls; mutations after a finish report; and overlapping starts. No test performs a real Git mutation.

- [x] **T04** — Add owner cancellation for waiting and active workflows.
  - **Depends on:** T03.
  - **Files:** `packages/git-integration/src/interface/pi/extension.ts`, `packages/git-integration/src/interface/pi/mode-parser.ts`, `packages/git-integration/test/helpers/pi-harness.ts`, and `packages/git-integration/test/pi-adapter.test.ts`.
  - Recognize the exact single `cancel` argument before mode parsing. Keep the existing three modes and reject extra arguments.
  - While waiting for a reply, restore and clear immediately. During model activity, request abort and await idle from the command handler.
  - During preparation or awaited selection, invalidate and await the start before final cleanup. Do not submit a cancelled task.
  - Serialize cancellation and cleanup. Keep cancellation distinct from shutdown so another Herald command can start afterward.
  - With no Herald workflow or start, report that fact without aborting unrelated chat activity.
  - Update command descriptions and invalid-mode help to show `/herald cancel`.
  - **Acceptance gate:** Interface tests pass for cancellation while waiting, streaming, preparing, and selecting a model; repeated cancellation; extra arguments; no active workflow; and a new start after cancellation. They verify restoration, cleared instructions and status, no late task submission, and no unrelated abort.

- [x] **T05** — Restore safely after terminal host errors and session changes.
  - **Depends on:** T04.
  - **Files:** `packages/git-integration/src/interface/pi/extension.ts`, `packages/git-integration/test/pi-adapter.test.ts`, and existing model-controller tests if needed.
  - Observe the latest final outcome at `agent_before_settle` without requesting continuation. Restore at settlement after terminal host error or abort, even without a finish report.
  - Keep Herald active after a recoverable tool error followed by a question. Do not preserve an earlier error after a successful retry.
  - Preserve failed-start, reload, and session-shutdown cleanup. Reuse existing session identity checks and start invalidation.
  - Test manual model and thinking changes across separate replies, including delayed selection events. Do not replace existing ownership rules.
  - **Acceptance gate:** Interface and model-controller tests pass for terminal error, recovered retry, recoverable tool failure, abort, failed start, reload, session replacement, and manual choices across pauses. Cleanup is repeat-safe and leaves no Herald-owned activation or status.

- [x] **T06** — Tell the model when to finish and when to wait.
  - **Depends on:** T05.
  - **Files:** `packages/git-integration/src/interface/pi/render-instructions.ts`, `packages/git-integration/src/interface/pi/render-task.ts` if needed, and `packages/git-integration/test/rendering.test.ts`.
  - Require `herald_finish` after the selected mode completes, after terminal workflow failure, or after cancellation in chat.
  - Forbid finish reports while waiting for approval or revisions. In full mode, do not finish between the commit and review-request stages.
  - Retain existing repository policy, hosting selection, mode limits, verification, and command approval guidance.
  - **Acceptance gate:** Rendering tests cover completion rules for all three modes, waiting and revision rules, terminal failure, cancellation, and unchanged provider-specific instructions. The Git integration tests pass.

- [x] **T07** — Verify the reported sequence on a real supported Pi host.
  - **Depends on:** T06.
  - **Files:** `packages/git-integration/test/supported-host.test.ts`.
  - Extend the existing local scripted provider. Return a commit proposal that asks for chat approval, settle, then submit a separate owner reply.
  - Capture model, reasoning value, and system prompt on each request. Check the proposal, approved continuation, finish tool call, and final summary. Restore only after the final settled event.
  - Verify instructions on both user runs and throughout a full-mode intermediate approval.
  - Use a harmless fake Bash tool and the real approval handler for recognized command checks. Do not run real commits or pushes or call an authenticated model provider.
  - Cover cancellation while waiting, terminal provider error, manual selections across replies, and reload. Verify that settings bytes stay unchanged and no extension errors occur.
  - **Acceptance gate:** `npm test -- packages/git-integration/test/supported-host.test.ts` passes. Recorded requests prove that both sides of the approval pause use Herald selections. Final-event and tool behavior are verified through Pi 1.3.0 rather than only through the fake host.

- [x] **T08** — Document the corrected lifetime and cancellation interface.
  - **Depends on:** T07.
  - **Files:** `packages/git-integration/README.md`, `packages/git-integration/CONTEXT.md`, and `.changeset/keep-herald-active-during-approval.md`.
  - Explain that one Herald workflow can contain multiple answers and owner replies. Selections, instructions, and mode checks remain active while waiting.
  - Document `herald_finish`, `/herald cancel`, active status, and unchanged command approval dialogs.
  - Explain the limit: if the model omits the finish call, Herald stays active until cancellation. Unrelated chat messages remain within Herald until it ends.
  - State that cancellation does not reverse completed commands, reset commits, or delete branches. Reload and session replacement do not resume an active Herald workflow.
  - Add a patch Changeset for `@manuelstolze/pi-git-integration`. Do not change package versions directly.
  - **Acceptance gate:** README and context agree with the approved specification and tested behavior. The Changeset has the correct package and `patch` release type. No existing ADR needs to change.

- [x] **T09** — Run final checks and record evidence.
  - **Depends on:** T08.
  - **Files and area:** Final diff, this task record, and validation output.
  - Rerun the T01 reproduction and supported-host approval sequence.
  - Run `npm test -- packages/git-integration/test`, `npm run typecheck`, `npm run build`, and `npm test`.
  - Inspect tracked and new files for unintended changes, generated output, credentials, and personal settings. Check whitespace in changed files.
  - Record commands, actual results, the original failing assertion, and remaining limits in section 4. Mark only completed tasks as done.
  - **Acceptance gate:** The reported switch no longer occurs in the scripted cross-message tests. All required checks have recorded results. Any failure or unrun check is explained. No temporary debug code or unrelated changes remain. State whether manual testing with a real model was run; do not imply that scripted responses prove model compliance.

## 3. Delivery

- **Branch:** `fix/keep-herald-active-during-approval`.
- **Commit subject:** `🐛 fix(git-integration): keep Herald active during approval`.
- **Pull request title:** `🐛 fix(git-integration): keep Herald active during approval`.
- **Pull request summary:** Keep Herald selections, instructions, and mode checks active across chat approval. Add explicit workflow completion and `/herald cancel`. Include reproduction evidence, checks, and known limits.
- **Approval gate:** The owner approved the specification, plan, and this task file before implementation.

## 4. Execution and validation record

T01 completed on `fix/keep-herald-active-during-approval`.

```text
npm test -- packages/git-integration/test/pi-adapter.test.ts
1 failed; 40 passed.
Failing test: keeps Herald selections and instructions while waiting for chat approval
Assertion: expected model id 'herald', received 'chat' after agent_settled.
```

This failure occurred before production changes or finish-tool additions to the
fake host. It reproduces the reported premature model restoration.

Earlier investigation baseline, before task approval:

```text
npm test -- packages/git-integration/test/pi-adapter.test.ts packages/git-integration/test/supported-host.test.ts
2 test files passed; 46 tests passed.
```

Those baseline tests did not reproduce the reported chat approval sequence.
T01 recorded the exact failure before production code changes.

### Completed implementation

- Kept workflow state, selections, instructions, and mode checks across chat pauses.
- Added `herald_finish`, active status, and `/herald cancel`.
- Preserved the existing model controller and its manual-selection rules.
- Added the declared Pi AI peer and development dependency. Ran
  `npm install --package-lock-only --ignore-scripts --offline`; only the Git
  integration dependency metadata changed. The installed dependency tree was not replaced.
- Updated the package README and context. Added the patch Changeset.
- Confirmed the cause: cleanup at every settled event confused a pause for chat
  approval with the end of the Git workflow.

### Final validation

| Command or check | Result |
| --- | --- |
| `npm test -- packages/git-integration/test/pi-adapter.test.ts -t 'keeps Herald selections and instructions while waiting for chat approval'` | Passed: one reproduction test; 62 unrelated tests skipped by the name filter. |
| `npm test -- packages/git-integration/test/supported-host.test.ts` | Passed: 17 supported-host tests. |
| `npm test -- packages/git-integration/test` | Passed: 11 files, 185 tests. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed for all five packages. |
| `npm test` | Passed: 24 files, 267 tests. |
| `git diff --check` | Passed. |
| New specification and Changeset whitespace check | Passed. |
| Search for temporary `[DEBUG-` markers | No matches. |

The supported-host tests use Pi 1.3.0 with a local scripted model provider and a
fake Bash tool. They verify model and thinking selections on both sides of chat
approval, a separate full-mode request approval, the final summary, restoration,
command approval dialogs, cancellation while waiting and streaming, terminal
provider errors, manual selections, and reload. Settings file bytes stay unchanged.

During test development, the new safety and cancellation tests first failed
before their implementation. Test setup problems were also corrected: a held
preparation fake initially held a later restart, the original `tools: []` host
option excluded the new tools, and Pi's dialog wrapper supplied a third argument.
The host now uses `noTools: true` to omit built-in tools while retaining registered
extension tools. Its fake Bash tool never starts a process. Final checks have no
remaining failures.

### Limits and follow-up

- No manual test with a real model was run. Scripted tests do not prove that a
  model will always follow the completion-tool instructions.
- If a model omits `herald_finish`, Herald remains active. Use `/herald cancel`.
- This work was not installed into the owner's Pi setup, committed, pushed, or
  published. No personal configuration was changed.
