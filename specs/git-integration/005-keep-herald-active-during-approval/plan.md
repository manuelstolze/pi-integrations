# Technical plan: Keep Herald active during chat approval

## Status and approval

- Specification: `spec.md`, approved by Manuel Stolze in the conversation.
- Plan: approved by Manuel Stolze in the conversation.
- Implementation and test changes: complete; results are recorded in `tasks.md`.
- Task breakdown: approved by the owner before implementation. All task gates passed.

The owner's approval includes two public interfaces:

1. A model tool named `herald_finish`, used to report workflow completion,
   terminal failure, or cancellation. A model tool is an operation the AI can call.
2. `/herald cancel`, used by the owner to leave an unfinished workflow.

The existing `/herald`, `/herald commit`, and `/herald request` meanings stay unchanged.

## 1. Evidence and limits

The current `extension.ts` calls `finish()` on every `agent_settled` event.
`finish()` restores the previous selections and clears the active mode and
pending instructions. The instructions are also consumed on the first
`before_agent_start` event.

The owner confirmed that Herald switches models after asking a question in
chat, before the owner replies. This is not a command approval dialog.

Baseline command already run:

```bash
npm test -- packages/git-integration/test/pi-adapter.test.ts packages/git-integration/test/supported-host.test.ts
```

Result: two test files passed; 46 tests passed. These tests do not cover the
reported sequence. The supported-host test currently returns an ordinary final
text response and expects restoration, without an explicit workflow result.

An exact failing reproduction is still required. Under the constitution, no
new test or reproduction code will be written before spec, plan, and task
approval. After those approvals, the first code change must add the reproduction
and run it before changing production code. If its failure does not match the
reported sequence, stop and correct the reproduction before implementing.

## 2. Verified Pi interfaces

The installed workspace host is Pi 1.3.0. The following exported declarations
were inspected in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`:

- `agent_settled` reports that automatic activity has stopped. It supplies
  `aborted`, but no indication that the user's workflow is complete.
- `agent_before_settle` supplies `outcome`: `completed`, `aborted`, or `error`.
  This describes Pi activity, not completion of the Git workflow.
- `registerTool()` accepts a tool with validated parameters and an execution
  function. Tools can use `exposure: "model-only"` to prevent nested tool calls.
- `defaultActive: false` permits registration without exposing the tool to the
  model until a workflow starts.
- `getActiveTools()` and `setActiveTools()` allow adding and removing this tool.
- `ExtensionContext.abort()` requests cancellation.
- Command contexts supply `waitForIdle()`.
- `ctx.ui.setStatus()` supplies a short workflow status without custom terminal
  components.

References read: Pi `docs/extensions.md`, the `hello.ts` tool example, and the
`plan-mode/index.ts` lifecycle example. The existing model controller already
uses supported selection and restoration interfaces. Its ownership rules for
manual selections will remain unchanged.

## 3. Proposed workflow lifetime

Keep the workflow state in the Pi interface layer. Do not add Pi events or
session types to the domain or application layers.

Use one active workflow record with:

- Existing mode and hosting provider.
- Instructions retained for the whole workflow.
- An optional reported result: `completed`, `failed`, or `cancelled`.
- The latest final Pi activity outcome, used only to recognize terminal host
  errors and cancellation at settlement.

Reuse the existing start promise, session identity checks, generation counter,
and shutdown handling. Avoid a second independent workflow owner.

### State transitions

| Event | Result |
| --- | --- |
| Successful preparation and selection | Activate Herald, expose `herald_finish`, set status, submit task. |
| Model asks a question and Pi settles normally | Keep model, thinking, instructions, mode checks, and finish tool active. |
| Owner replies | Add the active Herald instructions to the next run. Keep current selections; do not reread settings or force a manual selection back. |
| `herald_finish` reports a result | Record the result. Do not restore the model during tool execution. |
| Pi settles after a reported result | Restore selections and clear Herald state, tool activation, and status. |
| Pi settles after abort | Restore and clear, even without a reported result. |
| Pi settles after a final host error | Restore and clear, even without a reported result. |
| A Git tool fails and the model asks how to proceed | Keep Herald active. A tool error alone is not terminal workflow failure. |
| `/herald cancel` | Stop active activity if needed, wait for idle, restore, and clear. |
| Reload or session shutdown | Invalidate pending starts, await them, restore, and clear through existing shutdown handling. |

Read `outcome` at `agent_before_settle` without requesting continuation or
changing its entries. Perform cleanup at `agent_settled`, not at an earlier
`agent_end`, since retries or queued work can still follow that earlier event.
Use the latest final outcome, not any earlier recoverable error. Verify this
ordering in supported-host tests.

No text matching will infer completion from a sentence, question mark, or
language. Do not require an extra model request just to classify an answer.

## 4. Explicit completion tool

Register `herald_finish` with:

- `exposure: "model-only"`.
- `defaultActive: false`.
- `executionMode: "sequential"` to avoid concurrent state changes with other
  calls in the same batch.
- A parameter named `status`, restricted to `completed`, `failed`, and
  `cancelled`.
- A short `summary` string for the reported result.

The tool records a result only for the active workflow in the current session.
Without that workflow, return a clear error and change nothing. Repeated calls
must not cause repeated restoration. The tool must not execute Git commands,
approve commands, or write settings.

Keep it active until final settlement so the last model answer still uses the
Herald model. Return a short result and let the model provide its final summary.
After a reported result, block further recognized Git mutations within the
same workflow. This prevents a completion signal from opening a gap in the
existing action checks. Keep ordinary read-only calls available for a summary.

On activation, add only this tool to the current active tool names. On cleanup,
remove only the tool activation owned by Herald. Preserve unrelated tool
changes made during the workflow. Track whether the tool was already active
before Herald started so cleanup does not undo an owner's prior selection.
Check the active workflow inside the tool regardless of its activation state.

Update the Herald instructions to require the tool when the selected mode is
finished, when the model stops after a terminal failure, or when the owner
cancels in chat. Explicitly forbid its use while a question awaits an answer,
while revisions are requested, or between the commit and review-request stages
of full mode. Use mode-specific completion rules.

A model can omit this tool. In that case Herald remains active rather than
guessing that an approval question means completion. Show the active status
and document `/herald cancel` as the direct exit. Do not claim that tool
instructions guarantee correct model behavior.

## 5. Owner cancellation and guidance

Recognize the exact single argument `cancel` before the existing mode parser.
Reject extra arguments through normal command validation. Update invalid-mode
help and command descriptions to include `/herald cancel` without changing the
three existing modes.

- When Herald is idle and waiting for a reply, cancel immediately and restore.
- During an active model run, request abort and await `waitForIdle()` from the
  command handler before final cleanup. Never wait for idle from a lifecycle
  event handler.
- During preparation or model selection, invalidate that start with the existing
  generation counter, await it, and clean up. Do not submit its task afterward.
- When no Herald workflow is active or starting, report that fact. Do not abort
  unrelated chat activity.
- Serialize cancellation and cleanup so repeated requests cannot restore twice
  or start a replacement workflow before cleanup ends.

Keep the shutdown-only `closing` state distinct from owner cancellation, so a
cancelled Herald workflow can be followed by a new Herald command.

Show a plain status such as `Herald: commit — /herald cancel to exit` while a
workflow is active. Clear it during cleanup. An overlapping Herald command must
explain that the current workflow must finish or be cancelled first.

Cancellation never resets commits, deletes branches, or reverses completed
commands. Say this in the README.

## 6. Instructions and model ownership

Retain the active instructions rather than consuming them on the first run.
For each `before_agent_start` while Herald is active, append them to that run's
incoming system prompt. Do not append to a cached prompt from an earlier run,
which would duplicate instructions. Stop injecting them once cleanup completes.

Keep `HeraldModelController` as the only owner of temporary selections.
Start it once per workflow. Do not start it again for approval replies.
Its existing synchronous session-entry checks continue to protect manual model
and thinking changes across the longer workflow. Call its existing restoration
method once the workflow ends. Do not write settings files.

## 7. Affected files and boundaries

All behavior changes stay inside `packages/git-integration`.

| File | Planned change |
| --- | --- |
| `src/interface/pi/extension.ts` | Retain active workflow state; register finish tool; handle cancellation, final outcomes, status, and cleanup. |
| `src/interface/pi/render-instructions.ts` | Add explicit workflow completion and waiting rules. |
| `src/interface/pi/render-task.ts` | Add mode-specific finish guidance if needed; retain current action limits. |
| `src/interface/pi/mode-parser.ts` | Update help text for cancellation; retain mode parsing rules. |
| `test/helpers/pi-harness.ts` | Support registered tools, active tool names, status, abort, and realistic final outcomes. |
| `test/pi-adapter.test.ts` | Add cross-message reproduction; update restoration tests to use explicit completion. |
| `test/supported-host.test.ts` | Use scripted local responses across proposal, reply, finish call, and final summary. |
| Existing render and parser test files | Cover completion instructions and cancellation help. |
| `README.md` and `CONTEXT.md` | Explain workflow lifetime, completion, manual selections, and cancellation. |
| `package.json` | Declare `@earendil-works/pi-ai` as a peer and development dependency for the tool schema import. |
| Root `package-lock.json` | Keep workspace metadata synchronized. |
| `.changeset/keep-herald-active-during-approval.md` | Record a patch release for the Git integration. |

Use `Type` from `@earendil-works/pi-ai`, as shown in Pi's tool example.
Following ADR-0008, declare peer range `>=1.3.0 <2` and development range
`^1.3.0`. Do not depend on an undeclared indirect import. No new framework or
outside service is required.

No domain, application-port, hosting, or infrastructure behavior changes are
needed. Existing ADRs remain unchanged. Package README and context updates are
required because the workflow lifetime and cancellation interface are public.
No migration of settings or persisted session state is needed. Active Herald
workflows will not be restored after reload or session replacement.

## 8. Test strategy and gates

### First: reproduce before fixing

After all approvals, add a test through the real `registerGitIntegration()`
entry point. Start configured Herald, emit a normal settled event after a chat
proposal, assert Herald selections and mode checks remain, then simulate the
owner's reply through `before_agent_start`.

Run:

```bash
npm test -- packages/git-integration/test/pi-adapter.test.ts
```

Record the failing assertion before changing production code. It must fail
because the model restored at the approval question, not because a new tool API
is absent from the fake host. Establish this failure before extending fakes for
the proposed finish tool.

### Interface coverage

- Each mode: question, settlement, revision or approval reply, retained
  instructions, retained selections, finish report, final settlement, restoration.
- Full mode: commit approval, completed commit stage, later request approval,
  then finish. The intermediate stage must not end the workflow.
- No settings: mode limits and exact-command dialogs survive a chat pause.
- Manual model and thinking selections before and after a pause remain protected.
- Finish reports: all statuses, repeated calls, inactive calls, wrong-session
  calls, and a recognized mutation after a result was reported.
- Cancellation: waiting, streaming, preparation, model selection, repeated
  cancellation, and no active Herald workflow.
- Failed start, terminal host error, retry followed by success, recoverable tool
  error followed by a question, cancellation, reload, and session replacement.
- Tool activation preserves unrelated changes and any prior owner activation.
- Overlapping commands explain how to exit. A new command works after cleanup.

### Supported-host coverage

Extend the existing local provider rather than contacting a live model.
Script a proposal that ends with a chat approval question, then submit a
separate user reply. Capture each model request and its reasoning value.
Assert the Herald model and thinking value on both requests and on the final
summary request after `herald_finish`. Assert restoration only after the final
settled event.

Capture the actual system prompt on both runs to verify retained instructions.
Exercise recognized Git commands through a harmless fake tool implementation
and the real extension approval handler. Do not run real commits or pushes.
Keep a test for cancellation while waiting for a reply, terminal provider error,
manual selections across replies, and reload cleanup. Assert settings file bytes
remain unchanged and no extension errors occur.

### Final checks

```bash
npm test -- packages/git-integration/test
npm run typecheck
npm run build
npm test
```

Inspect the final diff for unrelated changes, generated output, credentials,
and personal paths. Report each check accurately. Manual testing with a real
model is useful follow-up but is not replaced by the scripted provider tests.

## 9. Risks and limits

- Completion depends on a model tool call. A missing call keeps Herald active;
  the status and owner cancellation command provide a visible exit.
- Unrelated chat messages sent before leaving Herald remain inside Herald.
  The extension will not infer intent from their wording. Document this rule.
- The completion tool reports a workflow result; it does not prove that a commit
  or review request exists. Preserve existing verification instructions.
- Final-event ordering, cancellation while starting, and other extensions'
  tool changes need tests. Do not replace existing model ownership logic.
- At planning, no exact cross-message reproduction had run. Implementation
  subsequently recorded its failure before the fix and a passing rerun after
  the fix. See `tasks.md` for results and remaining manual-test limits.

## 10. Delivery

- Current branch at planning: `build/require-pi-1-3`.
- Proposed implementation branch: `fix/keep-herald-active-during-approval`.
- Check the working tree before creating it. Preserve existing work and these
  specification files. Do not reset or discard another branch's changes.
- Commit subject: `🐛 fix(git-integration): keep Herald active during approval`.
- Pull request title: `🐛 fix(git-integration): keep Herald active during approval`.
- Pull request summary: Keep Herald selections, instructions, and mode checks
  active across chat approval. Use explicit workflow completion and provide
  `/herald cancel`. Include reproduction evidence, checks, and known limits.
- No commit, push, or pull request creation without an owner request.

## 11. Approval checkpoint

The owner approved this plan before task breakdown. Approval explicitly covers
`herald_finish`, `/herald cancel`, the visible active-workflow status, and the
Pi AI peer dependency. The owner subsequently approved `tasks.md` before
implementation. See that file for completed tasks and validation results.
