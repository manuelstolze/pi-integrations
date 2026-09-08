# pi-integrations

A monorepo for personal [Pi coding agent](https://github.com/earendil-works/pi) extensions (`@earendil-works/pi-coding-agent` on npm). Each extension lives in its own package under [`packages/`](./packages) and is published independently to npm, so it can be installed and shared with others.

## Repository layout

```
packages/
  hello-world/        # example extension, use as a template for new ones
    src/index.ts       # extension entry point (default-exports an ExtensionFactory)
    test/              # vitest tests
    package.json        # "pi": { "extensions": ["./dist/index.js"] }
  jira/                # read-only Jira tools and workflow skill
```

Extensions are plain npm packages that:

- `export default` a function of type `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>` from their compiled entry point.
- Declare their entry point under the `pi.extensions` field in `package.json`.
- Declare `@earendil-works/pi-coding-agent` as a `peerDependency` (users already have Pi installed).

See [`packages/hello-world`](./packages/hello-world) for a minimal, working example that registers a `/hello` slash command. See [`packages/jira-integration`](./packages/jira-integration) for read-only Jira tools and the bundled `jira-integration` skill.

## Getting started

```bash
npm install
npm run build      # compile every package with tsc
npm test           # run all tests with vitest
npm run typecheck  # type-check the whole workspace
```

## Adding a new extension

1. Copy `packages/hello-world` to `packages/<your-extension-name>`.
2. Update its `package.json` (`name`, `description`, `keywords`) and `src/index.ts`.
3. Add tests under `test/`.
4. Run `npm install` at the repo root to link the new workspace.
5. Add a changeset describing the change: `npx changeset` (choose the package(s) and bump type).

## Releasing to npm

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish packages:

1. When you make a change to a package, run `npx changeset` and follow the prompts to describe it. Commit the generated file in `.changeset/`.
2. On merge to `main`, the [release workflow](./.github/workflows/release.yml) opens (or updates) a "Version Packages" pull request with the version bumps and changelog entries.
3. Merging that pull request triggers the workflow to publish the updated packages to npm.

Publishing requires an `NPM_TOKEN` repository secret with publish access to the relevant npm scope/packages.