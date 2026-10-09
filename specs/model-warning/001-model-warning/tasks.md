# Opus Model Warning Tasks

- [x] **T01** — Add the `@manuelstolze/pi-model-warning` workspace package at `packages/pi-model-warning` with package metadata, TypeScript configuration, and a test entry point. **Acceptance gate:** the package is included by the existing `packages/*` workspace pattern and `npm install` updates `package-lock.json` without unrelated dependency changes.
- [x] **T02** — Implement Opus matching and model/session event handling in `packages/pi-model-warning/src/index.ts`. **Acceptance gate:** tests confirm case-insensitive ID matching across providers, warnings on non-Opus-to-Opus changes, no warning on Opus-to-Opus changes, warnings for `startup`, `new`, `resume`, and `fork`, no warning for `reload`, and no duplicate warning from a `restore` model event plus its session-start event.
- [x] **T03** — Implement the acknowledgement dialog and mode handling in `packages/pi-model-warning/src/index.ts`. **Acceptance gate:** tests confirm that TUI and RPC modes wait until explicit acknowledgement, cancellation repeats the dialog, and JSON and print modes do not request a dialog or wait.
- [x] **T04** — Document package installation and behavior in `packages/pi-model-warning/README.md` and `packages/pi-model-warning/CONTEXT.md`; add a Changeset for the new package. **Acceptance gate:** the README includes installation, use, and development instructions, the context records the Opus rule and event behavior, and the Changeset names `@manuelstolze/pi-model-warning` with an appropriate release bump.
- [x] **T05** — Run repository validation and review the final diff. **Acceptance gate:** `npm run typecheck`, `npm run build`, and `npm test` pass; the diff contains no settings, provider, installer, or unrelated package changes.

## Delivery

- **Branch:** `feat/pi-model-warning`
- **Commit subject:** `✨ feat(model-warning): add Opus warning rule`
- **Pull request title:** `✨ feat(model-warning): add Opus warning rule`
- **Pull request summary:** Add an independently installable Pi extension package that warns and waits for acknowledgement when a session enters or starts on Opus.
