# @manuelstolze/pi-git-integration

A Pi extension for controlled Git commits and GitLab merge requests or GitHub pull requests.

## What it provides

The extension adds the `/herald` command:

```text
/herald
/herald commit
/herald request
/herald mr
/herald pr
/herald cancel
```

Herald reads the repository's `CONTRIBUTING.md`, prepares structured commit and request plans, and asks for approval before it changes Git state.

It supports:

- GitLab.com and self-hosted GitLab.
- GitHub.com and GitHub Enterprise Cloud or Server.
- GitLab merge requests through `glab`.
- GitHub pull requests through `gh`.
- Forks and repositories with more than one Git remote.
- GitHub pull request templates and GitLab merge request templates.

Herald requires a readable `CONTRIBUTING.md`. It does not use a fallback commit policy.

## Provider tools

Install and authenticate the provider CLI used by the repository:

```bash
# GitHub
brew install gh
gh auth login

# GitLab
brew install glab
glab auth login
```

For self-hosted hosts, use the CLI's normal host option during login. Herald passes the detected host to the CLI.

## Options

```text
--provider github|gitlab
--target <branch>
--target-repo <host-or-path>
--template <name>
--push-remote <remote>
--target-remote <remote>
--allow-dirty
```

The default target branch order is `develop`, then `main`, then `master`.

## Safety rules

- Herald does not create or switch branches.
- Herald does not force-push.
- Herald does not delete source branches after merge.
- Herald does not update reviewers, labels, assignees, milestones, projects, or auto-merge settings.
- Git hooks and commit signing remain enabled.
- Provider commands run without interactive prompts.
- Direct Git commands are blocked during an active Herald workflow.
- Failed commits stop the workflow. Herald does not roll back successful commits.

## Development

From the repository root:

```bash
npm run build --workspace @manuelstolze/pi-git-integration
npm test -- --run packages/git-integration/test
npm run typecheck
```

The tests use fake command runners. They do not need GitHub or GitLab credentials or network access.

See the full design specification in [`docs/specs/herald.md`](../../docs/specs/herald.md).
