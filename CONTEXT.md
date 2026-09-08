# Repository context

## Purpose

`pi-integrations` is a monorepo for personal Pi coding agent extensions. Each extension is an npm package under `packages/` and can be published independently.

## Terms

- **Pi**: The coding agent that extensions add behavior to.
- **Extension**: An npm package that adds behavior to Pi.
- **Workspace**: A package under `packages/` managed by the root npm workspace.
- **Extension entry point**: The compiled JavaScript file that Pi loads for an extension.
- **Changeset**: A Markdown file that describes a published package change and its required version bump.

## Package rules

- Keep each extension in its own directory under `packages/`.
- Keep package source, tests, and package documentation inside that package directory.
- Use `packages/hello-world` as the small reference package and template.
- Export a default `ExtensionFactory` from the compiled entry point.
- Declare the compiled entry point in the package `pi.extensions` field.
- Declare `@earendil-works/pi-coding-agent` as a peer dependency.
- Add tests for user-facing behavior when practical.
- Edit source files under `src/`, not generated files under `dist/`.

## Release rules

- Publish each package independently to npm.
- Add a Changeset when a published package or its published behavior changes.
- Documentation-only, CI-only, and repository-only changes normally do not need a Changeset.
- Keep the root `package-lock.json` in sync with workspace package changes.
