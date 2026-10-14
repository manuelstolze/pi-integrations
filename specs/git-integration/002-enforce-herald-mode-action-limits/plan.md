# Technical plan: Enforce Herald mode action limits

## 1. Approach

Keep the action guard in the Pi interface layer. Store the active `GitMode` with the active provider when `/herald` prepares an agent turn. Classify the recognized command actions, compare them with the approved mode/action matrix, and block the full Bash command if it contains a disallowed action.

Detect both `gh pr create` and `glab mr create` without using the active provider as a detection condition. In request and full modes, either recognized request command requires approval, including a command for the provider that differs from the detected provider. Continue to block if the tool-call context has no UI. For each allowed command, show the exact `event.input.command` in the approval dialog. Clear mode and provider state when the agent turn settles.

Do not build a general shell parser or replace the Bash tool. Keep accepted ADR-0004 unchanged.

## 2. Affected areas

| Area | Planned change |
| --- | --- |
| `packages/git-integration/src/interface/pi/extension.ts` | Store and clear the active mode. Detect each recognized action independently of provider selection. Enforce the mode/action matrix, block mixed allowed and disallowed commands, fail closed without UI, and show the exact command for approval. |
| `packages/git-integration/test/pi-adapter.test.ts` | Add table-driven checks for each mode and action. Cover both hosting CLIs, provider mismatch, mixed-action commands, denied approval, missing UI, exact command display, and state reset. |
| `packages/git-integration/CONTEXT.md` | State the action allowed in each Herald mode and the approval rule. |
| `packages/git-integration/README.md` | Clarify the mode-specific commands and that disallowed actions are blocked. |
| `.changeset/` | Add a patch Changeset for `@manuelstolze/pi-git-integration`. |

No domain, application, infrastructure, public API, or ADR changes are planned. ADR-0004 remains accepted and unchanged.

## 3. Work sequence

1. Add focused interface tests for the mode/action matrix and failure cases.
2. Update the interface guard to retain the mode, identify recognized actions, block disallowed or mixed actions, and require approval for allowed actions.
3. Update the package context and README to describe the behavior.
4. Add a patch Changeset for the published package.
5. Run focused package checks and the repository validation checks. Review the final diff for scope and generated files.

## 4. Verification gates

Run from the repository root:

```bash
npm test -- packages/git-integration/test/pi-adapter.test.ts
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
npm run build
npm test
```

Acceptance gates:

- The focused interface tests pass for all three modes and every listed failure case.
- The Git integration package build passes.
- The full workspace typecheck, build, and test results are recorded. Report existing dependency failures separately; do not claim they pass.
- The diff contains the package behavior change, its documentation, its patch Changeset, and the approved specification artifacts only. No generated output is included.
- ADR-0004 and the public extension API remain unchanged.

The earlier repository assessment found that the current local dependency tree lacks `@earendil-works/pi-tui`. Do not run `npm ci` or replace the current dependency tree without discussing that action. If full-workspace checks remain blocked by this local issue, report the failure and the focused Git package results separately.

## 5. Risks and constraints

- The guard checks command text. It cannot guarantee control of every shell syntax or indirect command invocation. Do not expand this work into a shell parser or dedicated Git tools.
- A recognized hosting CLI command that differs from the detected provider is intentionally allowed after explicit user approval, as the owner selected. It is still classified as a review-request action and cannot bypass mode checks.
- A mixed command is blocked as a whole because the Pi tool-call guard cannot safely remove only its disallowed part.
- Preserve the shared GitHub and GitLab review-request flow recorded by accepted ADR-0004.

## 6. Delivery notes

- **Branch:** `fix/git-mode-action-limits`
- **Commit subject:** `🐛 fix(git-integration): enforce Herald mode action limits`
- **Pull request title:** `🐛 fix(git-integration): enforce Herald mode action limits`
- **Pull request summary:** Enforce the action limits for each Herald mode, detect both hosting CLI request commands, and show the exact command before approval.
