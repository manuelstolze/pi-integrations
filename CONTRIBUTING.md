# Contributing

Thank you for contributing to `pi-integrations`. This repository is a monorepo for npm packages that extend the Pi coding agent. Each package under [`packages/`](./packages) is built and published independently.

## Scope and change discipline

- Keep changes small, focused, and easy to review.
- Preserve the existing workspace layout and package conventions.
- Read the relevant package README, source files, and tests before changing behavior.
- Add or update tests when behavior changes.
- Update documentation when a package's setup or user-facing behavior changes.
- Do not commit credentials, personal settings, machine-specific paths, or generated output.

## Branches and pull requests

Create a branch for normal changes to `main`. Direct pushes to `main` are reserved for repository administrators handling exceptional recovery work.

Use this branch format:

```text
<type>/<optional-issue-number>-<short-description>
```

Use a lowercase kebab-case description. Omit the issue-number part when no issue exists.

Examples:

```text
docs/add-contributing-guide
feat/12-add-context-extension
fix/18-handle-missing-command-arguments
```

Open a pull request before merging. Keep the pull request focused. Explain the reason for the change, not only the files that changed.

## Commit messages

Use an emoji-prefixed conventional commit header:

```text
<emoji> <type>(<scope>): <imperative subject>
```

Examples:

```text
✨ feat(hello-world): add a greeting option
📝 docs(repo): document the release process
✅ test(hello-world): cover an empty name
👷 ci(release): verify npm authentication
```

Use this type and emoji mapping:

| Emoji | Type | Use for |
| --- | --- | --- |
| ✨ | `feat` | A new feature |
| 🐛 | `fix` | A bug fix |
| 📝 | `docs` | Documentation-only changes |
| 💄 | `style` | Formatting changes without logic changes |
| ♻️ | `refactor` | Code restructuring without a feature or fix |
| ⚡️ | `perf` | Performance improvements |
| ✅ | `test` | Adding or updating tests |
| 🏗️ | `build` | Build-system or dependency changes |
| 👷 | `ci` | CI or release workflow changes |
| 🔧 | `chore` | Maintenance and tooling changes |
| ⏪️ | `revert` | Reverting an earlier change |
| 🔒️ | `security` | Security fixes |
| 🚀 | `deploy` | Deployment-related changes |

Commit rules:

- Include exactly one matching emoji and type.
- Use a concise scope, such as `hello-world`, `release`, `repo`, or the affected package name.
- Keep the subject at 72 characters or fewer, including the emoji and scope.
- Use imperative mood and do not end the subject with a period.
- Keep each commit logically focused.
- Explain why the change is needed in the body when the reason is not clear from the subject.
- Keep body lines at 72 characters or fewer.

## Working on a package

Each extension package should:

- export a default `ExtensionFactory` from its compiled entry point;
- list its compiled entry point in the `pi.extensions` field in `package.json`;
- declare `@earendil-works/pi-coding-agent` as a `peerDependency`;
- include a README with installation, usage, and development instructions; and
- include tests for its user-facing behavior when practical.

Use [`packages/hello-world`](./packages/hello-world) as the small reference package and template for new extensions. Keep package-specific code, tests, and documentation inside that package directory.

When adding a package:

1. Create `packages/<package-name>`.
2. Add the package to the workspace through its `package.json`.
3. Add source code under `src/` and tests under `test/`.
4. Add a package README.
5. Run `npm install` from the repository root so the workspace lockfile stays current.
6. Add a changeset when the package will be published or its published behavior changes.

## Validation

Run the checks that match the files you changed. From the repository root:

```bash
npm run typecheck
npm run build
npm test
```

For a clean dependency and CI-style check, use:

```bash
npm ci
npm run typecheck
npm run build
npm test
```

Package-specific commands are also useful during development:

```bash
npm run build --workspace @scope/package-name
npm test -- --run packages/package-name/test
```

For manual testing in a real Pi session, see [Test extensions locally](./docs/local-extension-testing.md).

Do not include unrelated test failures in a pull request without explaining them. Record the validation commands and results in the pull request.

## Changesets and releases

This repository uses [Changesets](https://github.com/changesets/changesets) to version and publish packages.

Add a changeset for a change that affects a published package:

```bash
npx changeset
```

Choose the affected package and the required version bump. Commit the generated Markdown file in `.changeset/` with the change.

Documentation-only, CI-only, and repository-only changes normally do not need a changeset. Add one when a change affects the contents, API, installation, or behavior of a published package.

The release workflow runs on pushes to `main`:

1. Changesets opens or updates a `Version Packages` pull request.
2. Merging that pull request updates package versions and changelogs.
3. The workflow publishes the changed packages to npm.

Publishing needs an `NPM_TOKEN` repository secret with publish access to the affected packages. Do not put the token in the repository or in a local configuration file.

## Configuration and generated files

- Edit source files under `packages/`, not files under `dist/`.
- Do not commit `dist/`, coverage files, or TypeScript build information.
- Keep the root `package-lock.json` in sync with workspace package changes.
- Do not commit personal npm configuration or authentication files.
- Do not change release workflow secrets or package ownership settings without explaining the change in the pull request.

## Pull request checklist

Before requesting review, confirm that:

- [ ] The change is limited to the required files.
- [ ] Tests cover changed behavior, where practical.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] Package README files describe changed usage or setup.
- [ ] A changeset is included when a published package changes.
- [ ] No credentials, personal settings, or generated files are included.
- [ ] The pull request lists validation commands and known limitations.
