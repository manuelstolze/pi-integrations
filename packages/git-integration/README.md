# @manuelstolze/pi-git-integration

A Pi extension for guided Git commits, pushes, and GitHub pull requests or GitLab merge requests.
It collects Git context, creates a commit plan, and asks for approval before
it performs permanent Git actions.

## Compatibility

Requires Node.js 22.19.0 or later and Pi API 1.1.0 or later in the 1.x line. Pi API 0.x hosts are not supported.

## Installation

```bash
pi install npm:@manuelstolze/pi-git-integration
```

The extension detects the hosting provider from the `origin` remote. It uses
`gh` for GitHub and `glab` for GitLab. For self-hosted GitLab, the extension
probes `glab` against the current repository.

Install and authenticate the matching CLI if you want to use the request flow.

## Usage

Run the following commands inside a Pi session:

```text
/herald             # full mode: commits, push, and review requests
/herald commit      # commit mode: commits only
/herald request     # request mode: push and review requests for existing commits
```

Commit mode blocks push and review-request commands. Request mode blocks commit
commands. Full mode allows all four action types: commits, pushes, GitHub pull
requests, and GitLab merge requests. Before each allowed action, the extension
asks for approval and shows the exact Bash command. It blocks mixed commands
that include a disallowed action, commands when no user interface is available,
and commands that the user does not approve.

The extension reads `CONTRIBUTING.md` before it plans commits or a review
request. Request and full modes require a usable `origin` remote and a working,
authenticated hosting CLI. Commit mode works without either.

After `git init`, use `/herald commit` to prepare the first commit. Herald
reports that no commits exist and retains available branch and change information.
This works regardless of the language of Git error messages. Other Git failures
remain errors. Full mode also supports the first commit when its remote and
hosting-access requirements are met. The same approval rules still apply.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
```

The extension source is in `src/`. The compiled entry point is
`dist/index.js`.

The package follows the repository's hexagonal package structure. See
[`../../docs/hexagonal-packages.md`](../../docs/hexagonal-packages.md) for the
layer and testing rules.
