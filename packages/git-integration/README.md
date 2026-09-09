# @manuelstolze/pi-git-integration

A Pi extension for guided Git commits, pushes, and GitHub pull requests or GitLab merge requests.
It collects Git context, creates a commit plan, and asks for approval before
it performs permanent Git actions.

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
/herald             # full flow: commits, push, and merge request
/herald commit      # commit only
/herald request     # push and merge request for existing commits
```

The extension reads `CONTRIBUTING.md` before it plans commits or a review
request. It asks for approval before each commit, push, pull request, or merge
request command. Request and full modes require a usable `origin` remote and a
working, authenticated hosting CLI. Commit mode works without either.

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
