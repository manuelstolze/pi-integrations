# Implementation tasks: Configure the Herald model and thinking level

**Status:** Approved by the owner in the conversation. All implementation tasks are complete. Verification results are recorded below.

## 1. Execution rules

- Begin code and test changes only after the owner approves this file.
- Complete tasks in order unless a task explicitly permits independent work.
- Keep each checkbox unchecked until its acceptance gate passes. Record blocked or unrun checks separately.
- Keep package code, tests, and documentation inside `packages/git-integration/`. The Changeset belongs in the repository-root `.changeset/` directory.
- Preserve Git mode limits, hosting checks, and approval checks throughout the work.
- Do not change personal settings, credentials, or model definitions.
- Obtain separate approval before replacing the installed dependency tree. Task approval alone does not grant that permission.
- Stop and ask if supported Pi interfaces cannot meet the approved requirements. Do not silently weaken restoration or manual-choice behavior.

## 2. Ordered tasks

- [x] **T01** — Establish a supported validation environment and delivery branch.
  - **Files and area:** Repository working tree, package dependency environment, and validation notes in this file.
  - Confirm the working-tree state. Create `feat/configure-herald-model` without discarding existing work. Do not commit or push without a request.
  - Check the installed Pi version. The planning check found local Pi 0.85.1, below the package's `>=1.1.0 <2` requirement.
  - Agree on a supported validation environment with the owner. Obtain separate approval before replacing `node_modules`. Do not change dependency declarations or the lockfile just to repair the local installation.
  - Run the existing Git integration tests in that environment and record the baseline result.
  - **Acceptance gate:** A supported Pi environment is available, the branch is correct, and baseline checks have recorded results. Any unrelated baseline failure is identified before feature work continues.

- [x] **T02** — Define and test settings selection and validation.
  - **Depends on:** T01.
  - **Files:** `packages/git-integration/src/domain/herald-settings.ts`, `packages/git-integration/src/application/ports/herald-settings-port.ts`, and `packages/git-integration/test/herald-settings.test.ts`.
  - Add package-owned types for source data, source paths, read problems, and resolved settings. A settings port is an interface for reading outside settings data.
  - Add pure rules for per-field project overrides and validation. Keep them independent of Pi and Node.js imports.
  - Split exact model identifiers on the first `/`. Support model IDs that contain additional `/` characters.
  - Recognize `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.
  - Preserve the difference between an absent field and an invalid project override. Ignore unrelated settings and unknown Herald keys.
  - **Acceptance gate:** Tests pass for absent and valid fields, invalid shapes and types, both override directions, invalid project overrides, source-path retention, every thinking-level name, and model IDs containing `/`.

- [x] **T03** — Read current settings from user and trusted project files.
  - **Depends on:** T02.
  - **Files:** `packages/git-integration/src/infrastructure/config/file-herald-settings.ts` and `packages/git-integration/test/file-herald-settings.test.ts`.
  - Implement the read-only settings port for the standard Pi agent directory and the current project's `.pi/settings.json`.
  - Accept the resolved agent directory from the outer Pi code. Honor project trust before reading any project settings.
  - Treat missing files as normal. Return safe source-specific problems for unreadable files and invalid JSON. Retain valid settings from the other source.
  - Read fresh contents for each request. Do not cache active-run settings inside the file adapter or write any file.
  - Use temporary directories in tests. Clean up only directories created by those tests.
  - **Acceptance gate:** File tests pass for missing files, malformed JSON, read failures, trusted and untrusted projects, alternate agent directories, per-field overrides, and edits between reads. Tests confirm that original file contents remain unchanged.

- [x] **T04** — Apply a temporary model and thinking level with safe warnings.
  - **Depends on:** T03.
  - **Files:** `packages/git-integration/src/interface/pi/herald-model-controller.ts`, `packages/git-integration/src/interface/pi/render-settings-warning.ts`, and `packages/git-integration/test/herald-model-controller.test.ts`.
  - Capture the original model, thinking level, and session identity. Perform exact registry lookup and authentication checks without a diagnostic model request.
  - Handle an unknown model, missing authentication, a false `pi.setModel()` result, and a thrown selection error. Keep or restore the chat model before continuing.
  - Apply the configured thinking level independently of model fallback. If no thinking setting exists, reapply the captured chat level after a model switch. Do not use model startup defaults instead.
  - Let Pi limit thinking to supported levels. Read the effective level afterward.
  - Render warnings that identify the field, responsible source file, problem, fallback, and concrete correction steps. Do not print raw provider errors, credentials, or settings contents.
  - **Acceptance gate:** Controller tests pass for model-only, thinking-only, combined, and absent settings. Every model failure uses the chat fallback. Invalid or unsupported thinking keeps a usable configured model. Tests verify warning correction steps and absence of secrets.

- [x] **T05** — Restore temporary values while preserving later selections.
  - **Depends on:** T04.
  - **Files:** `packages/git-integration/src/interface/pi/herald-model-controller.ts` and `packages/git-integration/test/herald-model-controller.test.ts`.
  - Track model and thinking ownership separately. Ownership means Herald may still restore that value.
  - Track expected events from Herald's own changes, including automatic thinking changes during model selection. Do not rely only on a boolean around an asynchronous selection call.
  - Treat later external selections as changes to preserve. Include changes away from and back to the temporary value.
  - Implement one repeat-safe cleanup operation. Restore the model before thinking. Preserve a manual thinking selection across model restoration where supported.
  - Report restoration failures with `/model` or `/thinking` recovery steps. Do not write settings as a workaround.
  - The owner settled the incompatible-thinking conflict during implementation: restore the previous model, use a supported thinking level, and warn with correction steps.
  - **Acceptance gate:** Tests reproduce Pi's model-switch thinking side effect. Tests pass for normal restoration, repeated cleanup, manual model changes, manual thinking changes, changes away and back, and visible restoration failures. Any incompatible-choice conflict has an explicit owner decision before this task is complete.

- [x] **T06** — Connect settings and cleanup to all Herald commands.
  - **Depends on:** T05.
  - **Files:** `packages/git-integration/src/index.ts`, `packages/git-integration/src/interface/pi/extension.ts`, and `packages/git-integration/test/pi-adapter.test.ts`.
  - Create the settings adapter with Pi's public `getAgentDir()` function. Connect it to the command handler and honor `ctx.isProjectTrusted()`.
  - Preserve mode parsing and the existing user-interface requirement. Wait for idle before temporary model changes. Prevent overlapping Herald starts from replacing restoration state.
  - Read settings once at command start. Keep the selected values stable through the run.
  - Prepare Git context using the existing use case. Recheck session identity after awaited preparation before applying temporary settings or sending a task.
  - Restore only at the final `agent_settled` boundary, failed starts, or `session_shutdown`. Do not restore at an earlier `agent_end` when automatic work can continue.
  - Complete cleanup before reload or session replacement discards the old extension state. Clear pending instructions and active run state.
  - Keep the task and instruction renderers unchanged unless required by a test.
  - **Acceptance gate:** Interface tests pass for `/herald`, `/herald commit`, and `/herald request`; no-settings behavior; preparation failures; failed starts; cancellation; multiple turns; reload; session changes; repeated commands; and overlapping-start prevention. Settings edits affect the next run only. Existing mode and approval tests still pass.

- [x] **T07** — Verify supported-host event behavior and read-only settings use.
  - **Depends on:** T06.
  - **Files and area:** Git integration tests and a temporary Pi session. Record results in this file.
  - Check selection-event order against a supported Pi host rather than relying only on the fake interface.
  - Use controlled model responses and temporary or in-memory session data where practical. Verify restoration on settled runs and reload.
  - Verify that settings files are unchanged by temporary selection and restoration. Test `PI_CODING_AGENT_DIR` without editing personal configuration.
  - Do not make authenticated model requests or real Git changes without separate owner permission.
  - **Acceptance gate:** Supported-host checks confirm event tracking, restoration, and no settings writes. If a check cannot run, record the exact limitation and obtain agreement on the remaining verification before claiming completion. Report manual and automated results separately.

- [x] **T08** — Document the configuration contract and published feature.
  - **Depends on:** T06. May proceed independently of T07.
  - **Files:** `packages/git-integration/README.md`, `packages/git-integration/CONTEXT.md`, and `.changeset/<new-file>.md`.
  - Document `herald.model` and `herald.thinkingLevel`, exact identifier format, accepted thinking levels, settings locations, per-field overrides, project trust, and per-command reads.
  - Explain temporary selection, restoration, preserved manual choices, and warnings with concrete fix steps.
  - State that custom agent directories passed only by embedded applications are not supported. Do not imply that a placeholder model is a working selection.
  - Record the new stable behavior in the package context. Keep existing Git mode, hosting, and approval rules unchanged.
  - Add a minor Changeset for `@manuelstolze/pi-git-integration`. A Changeset records the published feature and required package version update.
  - **Acceptance gate:** Documentation matches tested behavior and explains warning fixes. The Changeset targets only the affected package with a minor update. No personal settings, credentials, or generated files are added.

- [x] **T09** — Run final checks and map results to the specification.
  - **Depends on:** T07 and T08.
  - **Files and area:** Final package and repository diff, plus validation notes in this file.
  - Run the commands below from the repository root. Record each result, including failures and unrun checks.
  - Review the diff against all acceptance criteria in `spec.md`. Map each criterion to a passing test or an explicitly recorded manual result.
  - Check that domain and application code remain independent of Pi and system APIs. Confirm no existing Git or hosting contract changed.
  - Check for unrelated changes, generated output, credentials, and personal settings.
  - **Acceptance gate:** Relevant tests, build, type checks, and whitespace checks pass in the supported environment. All acceptance criteria have verification evidence. Any remaining limitation is stated and approved rather than treated as success.

## 3. Validation commands

Run focused test files while completing their tasks. Run these final checks from the repository root:

```bash
npm test -- packages/git-integration/test
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
npm run build
npm test
git diff --check
```

## 4. Current validation state

### Environment and decisions

- Branch: `feat/configure-herald-model`.
- The owner separately approved `npm ci`. It completed and restored locked Pi 1.1.0 dependencies. Dependency declarations and `package-lock.json` are unchanged.
- Baseline: all 59 existing Git integration tests passed before feature work.
- The owner chose to restore the previous model when a later manual thinking choice is incompatible with that model. Herald warns and uses a supported level.
- npm audit reported two existing high-severity vulnerable packages: the indirect `vite` and `launch-editor` dependencies. No automatic fix or version change was made.
- No personal settings, credentials, commits, pushes, or review requests were changed or created. Host tests used dummy credentials and controlled local responses, not authenticated remote requests.

### Check results

| Check | Result |
| --- | --- |
| `npm test -- packages/git-integration/test` | Passed: 11 files, 147 tests. |
| `npm run build --workspace @manuelstolze/pi-git-integration` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed for all workspaces. |
| `npm test` | Passed: 24 files, 229 tests. |
| `git diff --check` | Passed. |
| Dependency declaration and lockfile diff check | Passed: no changes. |

The initial settings tests failed because the new modules did not exist. They passed after implementation. A supported-host regression then reproduced loss of a manual thinking selection when another extension delayed selection events. The fix checks recorded session changes as well as events and final values. The regression now passes.

### Acceptance evidence

Acceptance criterion numbers refer to `spec.md`.

| Criteria | Evidence |
| --- | --- |
| 1 | `test/pi-adapter.test.ts` covers temporary selection in all three modes. `test/supported-host.test.ts` confirms that Pi sends the request to the selected model. |
| 2 | Controller tests verify no selections or warnings without settings. Existing command tests still pass. |
| 3 | `test/herald-settings.test.ts` and `test/file-herald-settings.test.ts` cover per-field overrides, source paths, and invalid overrides. |
| 4 | File tests verify fresh reads. Interface tests verify that changes affect only the next run. |
| 5 | Controller tests cover thinking-only settings, retained chat thinking after model selection, invalid values, and model support limits. Host tests verify the effective request level. |
| 6 | Interface tests cover failures, cancellation, shutdown reasons, repeated cleanup, overlapping starts, and session changes. Host tests cover completion, cancellation, and real extension reload. |
| 7 | Controller and host tests cover manual model and thinking selections. Host tests include changes away and back before delayed events arrive. The owner-approved incompatible-thinking case has a controller test. |
| 8–10 | Controller tests cover unknown models, missing authentication, false or thrown selection results, rollback, invalid thinking, supported-level limits, warning fixes, and secret suppression. |
| 11 | The existing action and approval matrix still passes. New interface tests exercise the same checks with a configured model. |
| 12 | Package tests, README, context documentation, and `.changeset/quiet-herald-model.md` are present. |

Additional test support is in `test/helpers/pi-harness.ts`. Supported-host tests run inside Pi 1.1.0 with real session selection and event delivery. They verify `PI_CODING_AGENT_DIR`, unchanged settings-file contents, delayed events, cancellation, and reload without remote model calls.

### Limits and follow-up

- No manual check against a paid or authenticated remote model was run. Automated host checks used controlled responses.
- Forced process termination cannot run cleanup. The README explains how to check model and thinking selections after resuming such a session.
- The reported dependency advisories need a separate approved dependency change.
- No commit or push was made.

## 5. Delivery notes

- **Branch:** `feat/configure-herald-model`
- **Commit subject:** `✨ feat(git-integration): configure Herald model and thinking level`
- **Pull request title:** `✨ feat(git-integration): configure Herald model and thinking level`
- **Pull request summary:** Add temporary Herald model and thinking-level settings with per-field project overrides. Restore chat choices, preserve manual selections, and provide warnings with correction steps.
- **Approval gate:** The owner approved this file. Separate approvals remain required where stated above.
