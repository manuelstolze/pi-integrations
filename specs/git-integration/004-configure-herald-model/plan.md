# Technical plan: Configure the Herald model and thinking level

**Status:** Approved by the owner in the conversation. The owner also approved `spec.md`, including the standard Pi settings-location scope. Code and test changes still require approval of `tasks.md`.

## 1. Approach

Keep the feature inside `packages/git-integration/`. Preserve the current agent-led Git workflow, prompts, mode checks, and approval checks.

Separate settings rules from file access and Pi session control:

- Pure settings rules validate values and apply project overrides per field.
- A settings port returns the two settings sources and source-specific read problems. A port is an interface through which application code requests outside data.
- A file adapter reads settings without writing them.
- The Pi interface selects and restores models and thinking levels. It also renders warnings.
- `src/index.ts` creates the settings adapter and passes it to the Pi registration function.

Do not add a new agent, independent session, or generic model service. Do not change the existing Git and hosting ports. No new runtime dependency is planned.

## 2. Verified Pi behavior

The package declares support for Pi `>=1.1.0 <2`. Planning inspected the published Pi 1.1.0 type declarations and session implementation. It also inspected the installed Pi 1.3.0 documentation and extension example `model-status.ts`.

Verified interfaces:

- `getAgentDir()` resolves the normal Pi agent directory and honors `PI_CODING_AGENT_DIR`.
- `ctx.cwd` identifies the project directory. `ctx.isProjectTrusted()` reports whether project settings may be used.
- `ctx.modelRegistry.find(provider, modelId)` performs exact model lookup.
- `ctx.modelRegistry.hasConfiguredAuth(model)` reports configured authentication. It is not proof that a remote service will accept a request.
- `pi.setModel(model)` returns a promise of a boolean. It can also throw when authentication cannot be resolved.
- `pi.setModel()` and `pi.setThinkingLevel()` do not write startup defaults. They do record changes in the session transcript.
- Model selection can change the thinking level using model startup defaults. Herald must explicitly reapply its chosen thinking level after selecting a model.
- `pi.setThinkingLevel()` limits the requested value to model support. `pi.getThinkingLevel()` returns the effective value.
- `model_select` reports model changes. Its source does not distinguish a user selection from every extension selection.
- `thinking_level_select` reports thinking changes. It has no source field.
- `agent_settled` marks the end of a run after automatic continuations. Do not restore on the earlier `agent_end` event.
- `session_shutdown` also covers extension reload. Cleanup must finish before the old extension state is discarded.

Use only public imports. Do not reach into Pi session internals or alter the host's settings manager.

At planning time, local `node_modules` contained Pi 0.85.1. The owner later approved `npm ci`, which restored the locked Pi 1.1.0 environment. Implementation checks use that supported version. Dependency declarations and the lockfile remain unchanged.

## 3. Settings design

### Contract and validation

Use a small package-owned type for optional `model` and `thinkingLevel` values. Retain source paths and read problems separately so warning output can identify the responsible file.

For a model string, split on the first `/` only. Require a nonempty provider and model ID. Model IDs can themselves contain `/`. Never use partial-name matching.

Recognize the Pi 1.1.0 thinking-level names: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Keep these package validation rules independent of Pi imports.

Preserve the difference between an absent field and an explicitly invalid field. Apply project overrides before field validation. An invalid project value must not silently reactivate the user value it replaced.

Read only the `herald` object. Ignore unrelated settings and unknown Herald keys. Missing files are normal. Return read and JSON syntax problems as typed warning data. Do not expose raw settings contents or credential values in warnings.

### File locations and trust

Read `<getAgentDir()>/settings.json` and `<ctx.cwd>/.pi/settings.json` at each command start. Capture the resolved settings once for that run.

Do not read project settings if `ctx.isProjectTrusted()` is false. Preserve the user's settings in that case. Do not grant trust or bypass the trust check.

Use a read-only file adapter with Node.js file access. Avoid a second live Pi settings manager and its write or migration behavior. Do not use `pi.getSettings()` as the only source: it does not provide fresh source files and per-field source paths for this feature.

A broken source file produces a warning with its path and a repair instruction. Use valid settings from the other source where available. Do not rewrite or repair the file automatically.

## 4. Pi command and run control

### Start sequence

1. Retain existing mode parsing and the user-interface requirement.
2. Wait for the current agent operation to become idle before changing its model. Reject an overlapping Herald start rather than overwrite active restoration state.
3. Read and resolve settings. Collect required Git context using the existing preparation use case.
4. Capture the current model, thinking level, and session identity immediately before applying temporary settings. Recheck that the session still matches after awaited preparation.
5. Resolve the exact configured model with `ctx.modelRegistry.find()`. Check configured authentication. Attempt selection with `pi.setModel()` only when necessary.
6. If lookup or selection fails, keep or restore the original chat model. Emit a safe warning with correction steps. Do not send a diagnostic model request.
7. Select the requested thinking level, or the captured chat level if none was set. For invalid values, use the captured chat level as the fallback request. Let Pi limit the value to model support, then read the effective level with `pi.getThinkingLevel()`.
8. Warn if a configured thinking value was invalid or was limited by Pi. State the effective value. Do not discard a usable Herald model.
9. Arm the existing Herald instructions and action checks, then send the prepared task. Keep the current task and instruction renderers unchanged unless a test proves a change is necessary.
10. On a failure after temporary changes, restore owned values and clear pending run state.

The model fallback and thinking setting are independent. If the Herald model is unavailable, evaluate a valid thinking setting against the chat model actually used.

### Selection tracking

Keep one run record with original values, effective temporary values, session identity, and separate ownership flags for model and thinking level.

Listen for `model_select` and `thinking_level_select`. Track expected events from Herald's own changes, including automatic thinking changes caused by selecting a model. Do not classify those events as manual changes.

A later external selection relinquishes ownership of the affected value. Treat selections from another extension conservatively in the same way as user selections. Never force the Herald values again during the run.

Use event tracking as well as final-value comparison. A user can change away from a value and later return to it. Value equality alone must not reclaim ownership. Also inspect recorded model and thinking changes in the current session branch. These records are written before event delivery. Exclude Herald's own recorded changes so delayed event handlers cannot hide manual changes.

### Restoration

Use one repeat-safe cleanup operation for settled runs, failed starts, and session shutdown. Clear pending instructions and active run state when cleanup finishes.

- Restore only values Herald still owns.
- Restore the model before restoring the thinking level, since model selection can change thinking.
- If a manual thinking selection must survive model restoration, capture it and reapply it after the model switch where supported.
- If the user manually selected a different model, retain it. Limit any restored thinking value to that model's support.
- Handle cancellation through the final run boundary and session shutdown, not only the command's catch block.
- Complete reload cleanup before the extension is replaced. Do not mutate a new session using saved old-session state.
- On restoration failure, report the problem and a concrete `/model` or `/thinking` recovery step. Do not hide a failure or write settings as a workaround.

The owner settled the incompatible-thinking conflict during implementation: restore the previous model even if it cannot support a later manual thinking choice. Let Pi select a supported level, warn about the adjustment, and explain `/thinking` and `/model` correction steps.

## 5. Affected files and boundaries

All package paths below are relative to `packages/git-integration/`.

| Path | Planned change |
| --- | --- |
| `src/domain/herald-settings.ts` | Add small settings types and pure per-field selection and validation rules. |
| `src/application/ports/herald-settings-port.ts` | Declare read-only settings-source input and source-specific problems. |
| `src/infrastructure/config/file-herald-settings.ts` | Read user and trusted project files. Return data and safe read problems. |
| `src/interface/pi/herald-model-controller.ts` | Own temporary Pi selections, expected events, manual selections, and restoration. |
| `src/interface/pi/render-settings-warning.ts` | Render setting-specific warnings with source, fallback, and correction steps. |
| `src/interface/pi/extension.ts` | Connect command settings, temporary selection, event handlers, and cleanup to the existing workflow. |
| `src/index.ts` | Create the file settings adapter and supply the Pi agent directory. |
| `test/herald-settings.test.ts` | Cover pure settings rules. |
| `test/file-herald-settings.test.ts` | Cover real temporary settings files and read-only behavior. |
| `test/herald-model-controller.test.ts` | Cover selection, event tracking, thinking support, and cleanup. |
| `test/pi-adapter.test.ts` | Extend the Pi test harness and cover command lifecycle and unchanged action checks. |
| `README.md` | Document setup, supported levels, overrides, temporary behavior, and warning fixes. |
| `CONTEXT.md` | Record the new stable settings and restoration rules. |
| `.changeset/<new-file>.md` at repository root | Add a minor Changeset for `@manuelstolze/pi-git-integration`. |

Keep types small. Do not duplicate validation or warning text across layers. Add a separate application use case only if workflow rules would otherwise depend on Pi; do not introduce an empty forwarding layer.

No public command arguments, Git ports, hosting contracts, database migration, or package dependency changes are planned. Preserve ADR-0003, ADR-0004, and ADR-0005. No new architecture decision is required for this design.

## 6. Warning design

Each warning must name the field, the source path where applicable, the problem, the effective fallback, and a correction step.

- Invalid format: show the required `provider/modelId` format and how to remove `herald.model`.
- Unknown model: direct the user to `/model`, then explain how to copy an exact available identifier or remove the setting.
- Missing authentication: name the provider and direct the user to `/login` or the provider's credential setup. Offer removal of `herald.model` as an alternative.
- Invalid thinking name: list the accepted names and offer removal of `herald.thinkingLevel`.
- Unsupported thinking level: state the requested and effective levels. Direct the user to `/thinking` for supported choices, then explain how to update or remove the setting.
- Unreadable or invalid JSON file: name the file and explain that its Herald settings were not used. Tell the user to repair the file before the next command.

Do not print raw provider exceptions or file contents. Missing credentials detected before the run can use the chat fallback. A remote rejection during the actual model request remains a run failure; this feature does not add cross-provider retries after work has started.

## 7. Test strategy

### Pure rules and file access

Cover absent fields, valid values, wrong types, invalid object shapes, exact model parsing, model IDs containing `/`, every thinking-level name, and unknown keys.

Cover both directions of per-field project overrides. Include invalid project overrides and source-path retention.

Use temporary directories for file tests. Cover the default or injected agent directory, the environment override, trusted and untrusted projects, missing files, malformed JSON, read failures, and edits between command runs. Assert that settings contents remain unchanged.

### Pi selection and lifecycle

Extend the fake Pi interface with exact model lookup, configured-auth results, model selection, thinking selection, and selection events. Model selection in the fake must reproduce Pi's automatic thinking changes.

Cover:

- All three command modes and unchanged behavior without settings.
- A model setting alone, a thinking setting alone, and both settings together.
- Model lookup failure, missing authentication, a false selection result, and a thrown selection error.
- Invalid thinking values and supported-level limiting, while retaining a valid Herald model.
- Explicit reapplication of the chat thinking level after a model switch, rather than use of model startup defaults.
- Completion after multiple agent turns, cancellation, failed preparation, failed task start, reload, and session replacement.
- Duplicate cleanup calls, repeated commands, and overlapping-start prevention.
- Manual model changes, manual thinking changes, and changing away and back to the temporary values.
- Preservation of a manual thinking choice across model restoration where supported.
- Settings changes during an active run, which must affect only the next run.
- Warning content, correction steps, source paths, and absence of credentials.

Retain the full existing mode and approval test matrix. Do not perform real commits, pushes, review-request creation, or authenticated network model calls in automated tests for this feature.

### Supported-host verification

Use a Pi version in the declared support range. Exercise a real temporary session with read-only or in-memory settings and controlled model responses where practical. Verify that model and thinking changes do not change settings files. Check restoration on settled runs and reload.

A final manual check can use an available authenticated model with owner permission. Do not claim this check passed without running it. Report any untested live-host behavior separately from automated tests.

## 8. Work sequence and verification gates

After the owner approves this plan and `tasks.md`:

1. Create `feat/configure-herald-model` without discarding user work.
2. Confirm a supported dependency environment. Obtain approval before replacing the existing dependency tree.
3. Add the focused settings and lifecycle regression tests.
4. Implement settings rules and read-only file access.
5. Implement Pi selection, event tracking, and restoration. Connect them to Herald.
6. Update documentation and add the minor Changeset.
7. Run focused and repository checks. Review the final diff against every specification acceptance criterion.

Run from the repository root:

```bash
npm test -- packages/git-integration/test
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
npm run build
npm test
git diff --check
```

Acceptance gates:

- Every acceptance criterion in `spec.md` has a test or a recorded manual result.
- Tests run against supported Pi declarations and behavior, not local Pi 0.85.1.
- No Git action loses its mode restriction or required approval.
- Temporary choices do not leak into subsequent chat work or settings files.
- Manual choices survive cleanup where supported. Any incompatible-choice conflict is resolved with the owner rather than hidden.
- Warnings identify concrete fixes without leaking secrets.
- Documentation and the minor Changeset match the published behavior.
- Report passed, failed, and unrun checks accurately. Do not add generated files, credentials, or personal settings to the diff.

## 9. Risks and open points

- Pi selection events do not identify every caller. Expected-event tracking must be tested against the real event order. Do not assume a boolean around an asynchronous call is sufficient.
- Restoring a model can itself change thinking. Tests must cover that side effect before the feature is considered complete.
- The old chat model's credentials can become unavailable during a run. Restoration failure must be visible and actionable.
- A configured credential is not proof of remote acceptance. This feature does not validate paid access with a model request.
- Abrupt process termination cannot run cleanup. This plan covers normal completion, failures, cancellation, reload, and controlled session shutdown. It does not promise recovery after a forced process kill.
- Custom agent directories passed only by embedded applications are out of scope, as confirmed by the owner.
- The owner approved restoring locked dependencies with `npm ci`. Pi 1.1.0 now supplies the supported validation environment. npm reported existing high-severity advisories for the indirect `vite` and `launch-editor` dependencies. No automatic fix or dependency-version change is included.

## 10. Delivery notes

- **Branch:** `feat/configure-herald-model`
- **Commit subject:** `✨ feat(git-integration): configure Herald model and thinking level`
- **Pull request title:** `✨ feat(git-integration): configure Herald model and thinking level`
- **Pull request summary:** Add temporary Herald model and thinking-level settings with per-field project overrides. Restore chat choices, preserve manual selections, and provide warnings with correction steps.
- **Approval gate:** The owner approved this plan. Obtain approval of `tasks.md` before changing code or tests.
