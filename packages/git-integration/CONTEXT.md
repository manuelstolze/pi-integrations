# Git integration context

## Purpose

`@manuelstolze/pi-git-integration` is a Pi extension for guided Git commits and
hosted repository review requests.

## Terms

- **Git hosting provider**: The service that hosts the repository and its review requests, such as GitHub or GitLab.
- **Review request**: A GitHub pull request or GitLab merge request for reviewing proposed changes.
- **Herald mode**: One of the `commit`, `request`, or `full` modes that controls which part of the Git workflow runs.
- **Agent-led workflow**: A workflow where the extension prepares Git context and rules, then the Pi agent performs approved Git and review-request actions.
- **Target branch**: The branch that receives a review request. Repository rules take priority; otherwise GitHub uses its default branch and GitLab uses `develop`, then `main`, then `master`.

## Behavior

- The extension registers the `/herald` command.
- `/herald` runs the full commit, push, and review-request flow.
- `/herald commit` runs the commit flow only. Commit mode allows `git commit` actions and blocks pushes and review requests.
- `/herald request` runs the review-request flow only. Request mode allows pushes and review requests, and blocks commits.
- Full mode allows commits, pushes, and review requests.
- One Herald workflow can contain multiple answers and user replies. A chat approval question does not end the workflow. Its model, thinking level, instructions, mode limits, and command approval checks remain active while waiting.
- The model reports workflow completion, terminal failure, or cancellation through `herald_finish`. Restoration follows the final answer's settlement, not each chat pause. A finish report does not prove that Git actions succeeded. Further recognized Git mutations are blocked after a finish report until cleanup.
- `/herald cancel` leaves an unfinished workflow and restores temporary selections. It aborts active Herald model activity, but never reverses completed Git actions. It does not abort unrelated activity when no Herald workflow is active.
- Active status shows the mode and cancellation command. If the model omits its finish report, Herald stays active until cancellation or another cleanup boundary. Unrelated chat stays inside Herald until the workflow ends.
- Terminal host errors, aborted runs, reload, and session replacement clear Herald state. An unfinished workflow does not resume after reload or session replacement.
- Commit mode supports the first commit after `git init` without a remote or hosting access. Full mode supports the first commit only when its existing remote and hosting-access requirements are met.
- A current branch with no commits has empty history, regardless of the language of Git error messages. Herald states that no commits exist and retains available branch and change information. Other Git failures remain errors.
- The extension selects the Git hosting provider from the repository's origin and validates access before the full flow makes commits.
- The extension prevents duplicate open review requests for the current source and target branches.
- The extension asks for approval before every allowed recognized command and shows the exact Bash command. It blocks disallowed or mixed actions, actions without a user interface, and actions the user does not approve.
- GitHub pull requests do not automatically delete their source branch; GitLab merge requests keep source-branch removal enabled.
- The extension reads `CONTRIBUTING.md` and uses it as the first source for repository rules.
- All Herald modes accept optional `herald.model` and `herald.thinkingLevel` settings. The model is an exact AI `provider/modelId`, not a Git hosting provider.
- Herald reads the normal Pi user settings, honoring `PI_CODING_AGENT_DIR`, and trusted project `.pi/settings.json` before each command. Project values override user values per field. Changes apply to the next run without reloading Pi.
- Missing fields retain the current chat values where supported. Herald restores temporary selections after completion, failure, cancellation, reload, or controlled session shutdown without changing settings files.
- Later manual model and thinking selections are preserved where supported. If restoring the previous model makes a manual thinking choice unsupported, Herald restores that model, uses a supported level, and warns with correction steps.
- An invalid or unavailable model produces a warning and uses the chat model. Invalid or unsupported thinking produces a warning and uses a supported level without discarding a usable selected model. Warnings name the source setting and explain how to fix it.
- Overlapping Herald runs are not supported. Existing Git mode and approval rules remain in force regardless of AI model selection.

## Package conventions

- The package entry point is `dist/index.js`.
- The package declares that entry point in `pi.extensions`.
- Source files are under `src/`.
- The package README documents installation and usage.
