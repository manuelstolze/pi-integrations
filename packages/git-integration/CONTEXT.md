# Git integration context

## Purpose

`@manuelstolze/pi-git-integration` is a Pi extension for guided Git commits and
GitLab merge requests.

## Behavior

- The extension registers the `/herald` command.
- `/herald` runs the full commit, push, and merge request flow.
- `/herald commit` runs the commit flow only.
- `/herald request` runs the merge request flow only.
- The extension asks for confirmation before commit, push, and merge request
  commands.
- The extension reads `CONTRIBUTING.md` and uses it as the first source for
  repository rules.

## Package conventions

- The package entry point is `dist/index.js`.
- The package declares that entry point in `pi.extensions`.
- Source files are under `src/`.
- The package README documents installation and usage.
