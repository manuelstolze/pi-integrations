# Test extensions locally

This guide explains how to test an extension from this repository in a real Pi
session. It covers both source files and compiled package files.

## Prerequisites

- Node.js `22.12` or newer
- npm
- Pi installed and available as `pi`
- Pi provider credentials configured for interactive agent tests

Check the tools before you start:

```bash
node --version
npm --version
pi --version
```

The unit tests do not need Pi credentials. A real Pi session does.

## Run the repository checks

From the repository root, install dependencies and run the normal checks:

```bash
npm install
npm run typecheck
npm run build
npm test
```

To check one package, replace the package name and directory as needed:

```bash
npm run build --workspace @manuelstolze/pi-git-integration
npm test -- --run packages/git-integration/test
```

These checks test the extension code without starting Pi.

## Load the source extension in Pi

Use the `-e` (`--extension`) option for a quick local test. Use
`--no-extensions` so Pi does not load unrelated extensions from your user or
project settings.

Run this from the repository root:

```bash
pi --no-session --no-extensions \
  -e "$PWD/packages/git-integration/src/index.ts"
```

Pi can load TypeScript extension files directly. This command tests the current
source without a build step.

For another package, replace the path with its source entry point. For example:

```bash
pi --no-session --no-extensions \
  -e "$PWD/packages/hello-world/src/index.ts"
```

Use the extension's slash commands inside the Pi session. For Herald, use:

```text
/herald
/herald commit
/herald request
```

Do not use print mode (`-p`) for slash-command tests. Print mode does not have
the interactive user interface that these commands need.

## Test the compiled extension

Build the package first:

```bash
npm run build --workspace @manuelstolze/pi-git-integration
```

Then load the compiled entry point:

```bash
pi --no-session --no-extensions \
  -e "$PWD/packages/git-integration/dist/index.js"
```

Restart Pi after source or build changes. The `-e` option is intended for quick
local tests. It does not provide automatic reload for a file in this repository.

## Load the extension from `settings.json`

Use a local package entry when you want Pi to load the extension each time you
start Pi in this repository. Build the package first because its `package.json`
points Pi to `dist/index.js`:

```bash
npm run build --workspace @manuelstolze/pi-git-integration
```

Create or update `.pi/settings.json` in the repository:

```json
{
  "packages": [
    "/absolute/path/to/pi-integrations/packages/git-integration"
  ]
}
```

Replace the example path with the absolute path to this checkout. Start Pi from
the repository root:

```bash
pi --approve
```

Pi may ask you to trust the project before it loads project-local settings. The
`--approve` option trusts the project for this run. You can also save the trust
decision with `/trust` in an interactive session.

This setting is project-local. Do not commit `.pi/settings.json` unless the
repository should require this local extension path for every contributor.

To load the extension in every project, add the same package path to the global
settings file at `~/.pi/agent/settings.json` instead. This is usually not the
best choice for a development checkout.

For a source file without the package manifest, use the `extensions` setting:

```json
{
  "extensions": [
    "/absolute/path/to/pi-integrations/packages/git-integration/src/index.ts"
  ]
}
```

Use either `packages` or `extensions` for this extension. Do not add both
entries, or Pi may load the extension twice.

After rebuilding, use `/reload` in Pi to load the new compiled package. Restart
Pi if the extension was loaded with a direct `-e` path.

## Use a disposable Git repository

Herald can create commits, push branches, and create GitLab merge requests.
Test those actions in a disposable repository or a dedicated branch. Do not
start a full Herald flow in the repository root unless you intend to commit its
current changes.

The following commands create a small test repository and stage one file:

```bash
REPO_ROOT="$(pwd)"
TEST_REPO="$(mktemp -d)"

git init "$TEST_REPO"
printf '# Local extension test\n' > "$TEST_REPO/README.md"
git -C "$TEST_REPO" add README.md

cd "$TEST_REPO"
pi --no-session --no-extensions \
  -e "$REPO_ROOT/packages/git-integration/src/index.ts"
```

Inside Pi, start with:

```text
/herald commit
```

Review the proposed commit and approve it only when the test result is correct.
This creates a commit in the disposable repository.

Use `/herald request` or `/herald` only when you also want to test push and
merge request behavior. Those modes can contact GitLab and perform permanent
Git actions. The GitLab CLI must be installed and authenticated:

```bash
glab auth status
```

## Test changes repeatedly

Use this loop when developing an extension:

1. Edit the source files.
2. Run the focused unit tests.
3. Start Pi with the source entry point.
4. Exercise the extension command or tool.
5. Exit Pi.
6. Repeat.

For a compiled-package test, build the package before step 3 and load its
`dist/index.js` entry point.

## Troubleshooting

### The command is not available

Check that the `-e` path is correct and points to the extension entry point.
Use an absolute path if the working directory is not the repository root.

### The extension loads old code

Restart Pi. If you loaded `dist/index.js`, build the package again first.

### The extension cannot access the Git repository

Pi uses the directory where it starts as the current working directory. Start
Pi in the test repository that you want the extension to inspect.

### Pi asks about project trust

Project-local resources need trust before Pi loads them. The direct `-e` method
loads the selected extension explicitly. Follow Pi's trust prompt only when you
intend to load project-local resources.

### A manual test would change real data

Stop the session and use a disposable repository. The extension's approval
prompts reduce risk, but they do not replace a safe test repository.
