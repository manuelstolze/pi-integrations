# Herald Git integration specification

**Status:** Accepted for v1
**Package:** `@manuelstolze/pi-git-integration`
**Location:** `packages/git-integration/`
**Command:** `/herald`

## 1. Purpose

Herald is a Pi extension for preparing and publishing Git changes. It creates local commits and creates or updates a GitLab merge request (MR) or GitHub pull request (PR).

Herald supports:

- GitLab.com.
- Self-hosted GitLab.
- GitHub.com.
- GitHub Enterprise Cloud, including hosts such as `example.ghe.com`.
- GitHub Enterprise Server on custom hosts.

The first release does not create or switch branches.

## 2. Package boundary

The package owns the complete Herald workflow and all Git write actions.

The agent still performs analysis. It reads the diff, reads repository policy, groups files into commits, writes commit messages, and drafts the MR or PR. The extension validates the agent's structured plans, asks for approval, and executes approved actions.

The agent must not perform Herald Git writes through `bash`.

## 3. User commands

```text
/herald                         full workflow
/herald commit                 commit only
/herald request                push and create or update an MR or PR
/herald mr                     alias for request
/herald pr                     alias for request
/herald cancel                 cancel the active workflow
```

`/herald` starts after it shows a preflight summary. It does not ask for an extra confirmation at this point.

The request result uses the provider's name:

- GitLab produces a merge request.
- GitHub produces a pull request.

## 4. Command options

The first release supports these options:

```text
--provider gitlab|github
--target <branch>
--template <name>
--push-remote <remote>
--target-remote <remote>
--allow-dirty
--target-repo <repository>
```

An explicit provider overrides automatic provider detection. An explicit target branch overrides the default target branch order. An explicit target repository overrides remote discovery.

## 5. Workflow stages

Herald uses a state machine. A state machine is a fixed list of workflow stages. The stages are:

```text
preflight
  -> commit plan
  -> commit approval
  -> commit execution
  -> request draft
  -> request approval
  -> push and request creation or update
  -> completed
```

The exact stages depend on the command:

### Full mode

```text
preflight -> commit plan -> commit execution -> request draft -> push/request
```

If the working tree has no uncommitted changes, full mode stops. It does not skip directly to request creation. The user can run `/herald request` when existing commits are ready.

### Commit mode

```text
preflight -> commit plan -> commit execution
```

Commit mode does not require a provider CLI. It stops when there is nothing to commit.

### Request mode

```text
preflight -> request draft -> push/request
```

Request mode assumes that the commits already exist.

Herald enforces the stage order. Invalid tool calls fail without changing Git state.

## 6. Preflight

Herald shows a summary containing, when available:

- Repository identity.
- Detected provider and host.
- Current branch.
- Push remote.
- Target repository or target remote.
- Target branch.
- Changed file count.
- Required provider CLI.

Full and request modes run provider preflight before any write action. The preflight checks:

- Required CLI availability.
- CLI authentication for the detected host.
- Repository access.
- Target branch availability.
- Remote selection.
- Readable `CONTRIBUTING.md`.

Commit mode checks Git and `CONTRIBUTING.md`, but does not require `gh` or `glab`.

Herald does not install CLIs or change CLI authentication. If a CLI is missing, it stops and shows installation and login instructions.

Herald fetches the selected remotes during preflight to update remote references. It does not fetch with pruning. It does not change working files, merge, rebase, or push.

## 7. Repository policy

A readable `CONTRIBUTING.md` is mandatory before Herald plans commits or requests.

Herald does not use a fallback commit policy. If the file is missing or unreadable, Herald stops and tells the user to add or fix it.

The agent reads and follows the repository policy for:

- Commit format.
- Commit scopes.
- Validation commands.
- Documentation requirements.
- MR or PR content.
- Branch rules.

Herald performs only general safety checks on commit messages. It does not require one fixed format, emoji, or scope format.

## 8. Provider detection

Known hosts are detected directly:

```text
github.com        -> GitHub
ghe.com subdomain -> GitHub
gitlab.com        -> GitLab
```

For another host, Herald performs read-only repository checks with both `gh` and `glab`. It uses the provider where exactly one check succeeds.

If neither or both checks succeed, Herald asks for a provider or requires `--provider`.

The provider CLI receives the custom hostname when required. Authentication remains in the CLI configuration.

## 9. Remote and fork handling

Herald separates the source push location from the request target.

### Push remote

1. Use the remote tracked by the current branch.
2. If no tracking remote exists, use `origin`.
3. Allow `--push-remote` to override this choice.

### Target remote

1. Use an explicit `--target-remote` value when provided.
2. Otherwise use `upstream` only when the fork setup is clear.
3. Require the remotes to use the same provider host and compatible repository paths.
4. Otherwise ask the user to select the target remote.

Herald never selects an unrelated `upstream` remote silently.

Fork workflows are supported. Herald pushes to the source remote and creates the request against the selected target repository.

If the current branch has no upstream, Herald sets it automatically during the approved push:

```bash
git push --set-upstream <push-remote> <branch>
```

## 10. Target branch selection

Use this order:

1. Explicit `--target` value.
2. `develop`, if available.
3. `main`, if available.
4. `master`, if available.
5. Ask the user if no branch is available.

Herald never silently chooses another branch.

If the current branch is a default or target branch, Herald shows a warning and asks for explicit confirmation before creating commits. It does not create or switch branches.

## 11. Commit plans

The agent submits a structured `herald_commit_plan` tool call.

Each commit group contains:

- A list of files.
- A complete commit message.
- Validation commands and short results.

Rules:

- A file can appear in only one commit group.
- Herald rejects plans that list one file in more than one group.
- Commit groups operate at file level.
- Hunk-level grouping is not part of the first release.
- Every changed file must be included in a commit or marked as untouched.
- Untouched files remain unchanged and are shown during approval.
- Staged, unstaged, and untracked files are supported.
- Herald stages only files in the approved group.
- Files outside the group remain untouched.

Herald records the Git status and diff when the plan is submitted. Before execution, it compares a new status and diff with that snapshot. If they differ, Herald rejects the plan and requires a new plan.

The user sees the complete plan and chooses:

```text
Approve
Revise
Cancel
```

`Revise` collects user feedback and returns it to the agent. The agent submits a new structured plan. The user does not edit the structured commit plan directly.

`Cancel` stops the workflow without rolling back existing user work.

## 12. Commit execution

The extension executes approved commits through direct `pi.exec()` calls. It passes command arguments separately and does not build shell commands.

Herald:

- Keeps normal Git hooks enabled.
- Keeps commit signing enabled.
- Does not use `--no-verify`.
- Does not change Git configuration.
- Stops at the first failed commit.
- Keeps successful earlier commits.
- Does not continue later groups automatically.
- Does not run `git reset`, `git clean`, or another rollback automatically.

If the failed group was staged before the failure, Herald reports that state clearly.

## 13. Validation

The agent runs repository validation commands before submitting the commit plan. Herald does not run arbitrary project commands automatically.

The commit plan includes short validation results. Herald shows them during approval.

If validation fails:

- Show every failed command.
- Show a short result, not full output by default.
- Require a separate explicit confirmation to continue.
- Preserve the failure in the MR or PR draft.
- Require an override reason when `CONTRIBUTING.md` marks the check as mandatory.

## 14. Request drafts

The agent submits a structured `herald_request_plan` tool call.

The plan contains:

- Provider.
- Source branch.
- Target repository.
- Target branch.
- Title.
- Body, which may be empty.
- Selected request template.
- Commit summaries.
- Validation results.

Request templates are optional.

Supported template locations include:

```text
.github/pull_request_template.md
.github/PULL_REQUEST_TEMPLATE/
.gitlab/merge_request_templates/
```

Template selection follows these rules:

1. Explicit `--template` wins.
2. One available template is used automatically.
3. Several templates cause an interactive selection.
4. Herald never selects among several templates silently.
5. If no template exists, use the built-in neutral request structure.

The user can edit the request title and body in the Pi editor. Herald then shows the edited draft and offers:

```text
Approve
Revise
Cancel
```

`Revise` returns feedback to the agent. `Cancel` stops without pushing.

The request body includes concise validation results when content exists. An empty request body is valid. It does not include full command output by default.

## 15. Request approval and creation

The request tool records:

- Current branch.
- Source `HEAD` commit.
- Target repository.
- Target branch and commit, when available.
- Provider.

Before pushing, Herald checks the source branch and `HEAD` again. If either changed, Herald requires a new request draft.

If the target branch changed, Herald shows this choice:

```text
Continue without synchronizing
Rebase onto the target branch
Merge the target branch
Cancel
```

Rebase and merge require separate approval. Herald does not perform either action automatically. After a rebase or merge, Herald takes a new snapshot and requires a new plan.

If an approved rebase or merge conflicts:

- Stop the workflow.
- Leave the rebase or merge active.
- Show the conflicted files.
- Do not resolve conflicts automatically.
- Do not abort the operation automatically.
- Require a new Herald run after resolution.

Provider commands are non-interactive. Herald provides all required values and does not open a browser or provider editor.

Approved requests are created as ready requests, not drafts.

Herald does not delete source branches after a request is merged.

Herald does not set:

- Reviewers.
- Assignees.
- Labels.
- Milestones.
- Projects.
- Auto-merge settings.

## 16. Existing requests and retries

Before creating a request, Herald searches for existing requests for the selected source and target.

### Open request

- Return the existing request instead of creating a duplicate.
- Ask whether the user wants to update it.
- If updating, show and edit the title and body.
- Push new local commits when needed.
- Update the title and body after approval.
- Keep the original target repository and target branch.

### Closed request

- Show the closed request.
- Ask whether to create a new request.

### Merged request

- Show the merged request.
- Stop.
- Do not create another request automatically.

### Several matching requests

Show each request with its provider, target repository, target branch, title, state, and URL. Ask the user to select one. Never choose silently.

After an unclear push or request result, Herald checks remote state before retrying. It returns an existing result when found. It retries only when the action is confirmed not to have happened. If the state remains unclear, it asks the user.

## 17. Git write protection

The structured Herald tools are active only during an active Herald workflow.

While Herald is active:

- Block every agent `bash` command that invokes Git.
- Provide read-only Git data through `herald_git_context`.
- Keep non-Git validation commands available.
- Run Git writes only inside Herald's extension code.

User shell commands use a separate rule:

- Safe read-only Git commands may run without a prompt.
- A command that may change Git state asks for confirmation.
- If allowed, Herald cancels the active workflow before running the command.
- If blocked, Herald stays active.
- The user can run `/herald cancel` to clear the workflow.

Cancelling does not undo commits, pushes, or request changes.

## 18. Workflow state and recovery

Herald persists workflow state in the Pi session.

The state records:

- Current workflow stage.
- Source branch.
- Source `HEAD`.
- Target repository and branch.
- Commit groups.
- Successful commit hashes.
- Push results.
- Request results.
- Errors and validation overrides.

Herald never repeats a completed commit automatically. It never rolls back commits automatically.

## 19. Provider commands

Use direct argument arrays with `pi.exec()`. Do not pass multiline request bodies through shell strings.

GitLab uses `glab` for:

- Authentication checks.
- Request lookup.
- MR creation.
- MR updates.

GitHub uses `gh` for:

- Authentication checks.
- Request lookup.
- PR creation.
- PR updates.

The provider adapters must pass custom host, repository, source branch, target branch, title, and body explicitly when the CLI needs them.

## 20. Testing

Automated tests stay offline.

Use fake command runners to test:

- Remote URL detection.
- GitLab.com and GitHub.com detection.
- Self-hosted GitLab detection.
- `*.ghe.com` detection.
- Unknown-host probing.
- Provider overrides.
- Target branch selection.
- Remote and fork selection.
- Template selection.
- Commit plan validation.
- Snapshot invalidation.
- Workflow stage enforcement.
- Approval, revision, cancellation, and failure paths.
- Exact `git`, `glab`, and `gh` arguments.
- Existing request lookup and update behavior.
- Unclear-result recovery.

Real GitHub and GitLab checks are manual. CI does not need provider credentials or network access.

## 21. Future work

The following items are tracked as proposed ADRs:

- `docs/adr/0003-herald-branch-creation.md` — branch creation.
- `docs/adr/0004-herald-request-metadata.md` — labels, reviewers, assignees, milestones, projects, and auto-merge.
- `docs/adr/0005-herald-force-push.md` — force push support.
- `docs/adr/0006-herald-hunk-level-commit-grouping.md` — splitting one file across commits.
- `docs/adr/0007-herald-draft-requests.md` — draft MRs and PRs.
- `docs/adr/0008-herald-issue-references.md` — automatic issue references.

## 22. Accepted design decisions

- `docs/adr/0009-herald-structured-workflow-tools.md` — structured tools own side effects.
- `docs/adr/0010-herald-provider-cli-boundary.md` — `gh` and `glab` are the provider boundary.
- `docs/adr/0011-herald-requires-contributing-policy.md` — readable `CONTRIBUTING.md` is mandatory.

## 23. Open points

These points were not finalized during the design session:

- The exact provider lookup commands for every self-hosted CLI version.
- The exact persistence format for session recovery.
- The exact UI layout for long commit plans and request drafts.
