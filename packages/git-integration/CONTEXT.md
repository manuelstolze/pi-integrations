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
- `/herald commit` runs the commit flow only.
- `/herald request` runs the review-request flow only.
- The extension selects the Git hosting provider from the repository's origin and validates access before the full flow makes commits.
- The extension prevents duplicate open review requests for the current source and target branches.
- The extension asks for confirmation before commit, push, and review-request commands.
- GitHub pull requests do not automatically delete their source branch; GitLab merge requests keep source-branch removal enabled.
- The extension reads `CONTRIBUTING.md` and uses it as the first source for repository rules.

## Package conventions

- The package entry point is `dist/index.js`.
- The package declares that entry point in `pi.extensions`.
- Source files are under `src/`.
- The package README documents installation and usage.
