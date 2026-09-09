# @manuelstolze/pi-git-integration

A Pi extension for guided Git commits, pushes, and GitLab merge requests.
It collects Git context, creates a commit plan, and asks for approval before
it performs permanent Git actions.

## Installation

```bash
pi install npm:@manuelstolze/pi-git-integration
```

The extension uses the GitLab CLI (`glab`) to create merge requests. Install
and configure `glab` if you want to use the merge request flow.

## Usage

Run the following commands inside a Pi session:

```text
/git          # commits, push, and merge request
/git commit   # commit only
/git mr       # push and merge request for existing commits
```

The extension reads `CONTRIBUTING.md` before it plans commits or a merge
request. It asks for approval before each commit, push, or merge request
command.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
```

The extension source is in `src/`. The compiled entry point is
`dist/index.js`.
