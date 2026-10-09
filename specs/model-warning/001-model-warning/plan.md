# Opus Model Warning Plan

## Approach

Add the warning as an independently installable workspace package at `packages/pi-model-warning`, following the package layout and metadata used by `packages/hello-world` and the UI dependency conventions used by `packages/permission-gate`.

- Publish the package as `@manuelstolze/pi-model-warning`.
- Match `model.id` with a case-insensitive `opus` substring. Do not filter by provider.
- Handle `model_select` events when `source` is `set` or `cycle` and the new model is Opus while the previous model is not Opus. Treat a missing previous model as non-Opus. Ignore Opus-to-Opus changes.
- Handle `session_start` when `ctx.model` is Opus and the reason is `startup`, `new`, `resume`, or `fork`. Ignore `reload`.
- Use `session_start` as the warning path for model restores. Ignore `model_select` events whose source is `restore`. This prevents a restore and its related session-start event from showing duplicate warnings, without suppressing later session starts or transitions into Opus.
- In TUI and RPC modes, use a blocking one-choice `ctx.ui.select()` dialog. Repeat it until the user selects the acknowledgement action. A missing or cancelled response is not acknowledgement.
- In JSON and print modes, use `ctx.hasUI` to skip the dialog and continue.
- Keep model selection unchanged. Store no acknowledgement state across sessions.

## Package files

Add the following files under `packages/pi-model-warning/`:

- `package.json` with the package name, compiled entry point, `pi.extensions` metadata, build script, and Pi peer dependencies.
- `tsconfig.json` following the repository package template.
- `src/index.ts` for the extension factory, event handlers, model matching, and acknowledgement flow.
- `test/index.test.ts` for matching, event handling, duplicate prevention, acknowledgement, cancellation, and modes without UI.
- `README.md` with installation, use, and development instructions.
- `CONTEXT.md` with stable package behavior and event rules.

The workspace already includes every directory matched by `packages/*`. Run `npm install` after adding the package metadata to update the root lockfile. Add a Changeset for the new published package.

## Interfaces and dependencies

- Use `ExtensionAPI`, event types, and extension context types from `@earendil-works/pi-coding-agent`.
- Use the documented `model_select` fields: `model`, `previousModel`, and `source`.
- Use the documented `session_start` fields: `reason` and `ctx.model`.
- Use `ctx.hasUI` and `ctx.ui.select()` for the acknowledgement flow.
- Declare `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` as peer dependencies, with matching development dependencies, as required by the Pi UI package conventions.
- Add no runtime dependencies and no configuration options.

## Documentation and architecture records

- Add package-level `CONTEXT.md` and `README.md` files.
- No root context or ADR change is needed. This package follows existing workspace boundaries and does not change a repository-wide architecture decision.
- Do not change settings, providers, installer behavior, or other packages.

## Validation

- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm test`.
- Review the final diff to confirm that the package, lockfile, Changeset, and spec artifacts are the only changed files and that no generated build output or settings changed.

## Acceptance gates

- Tests cover case-insensitive Opus matching across providers.
- Tests cover transitions into Opus, Opus-to-Opus changes, and each supported session-start reason.
- Tests confirm that `model_select` with source `restore` does not duplicate a warning from `session_start`.
- Tests confirm that the dialog waits for acknowledgement and repeats after cancellation.
- Tests confirm that modes without UI do not request a dialog or wait.
- The package builds and tests as part of the repository workspace.
- No model selection, settings, provider configuration, or other package behavior changes.

## Delivery

- **Branch:** `feat/pi-model-warning`
- **Commit subject:** `✨ feat(model-warning): add Opus warning rule`
- **Pull request title:** `✨ feat(model-warning): add Opus warning rule`
- **Pull request summary:** Add an independently installable Pi extension package that warns and waits for acknowledgement when a session enters or starts on Opus.
