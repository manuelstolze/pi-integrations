---
id: MODEL-002
domain: model-warning
services:
  - "@manuelstolze/pi-model-warning"
status: approved
owner: Manuel Stolze
---

# Tasks: Align Model Warning with hexagonal architecture

- [x] **T01** — Extract model-warning rules into the domain layer. Add pure
  rules for Opus matching and warning eligibility. Keep Pi event types out of
  domain inputs. Add domain tests for model IDs, selection sources and prior
  models, session-start reasons, and the active model. Keep the current
  `isOpusModelId` entry-point export available.
  **Acceptance gate:** domain tests pass without Pi or system APIs; the
  existing entry point still builds; the Opus matching and eligibility rules
  match the approved spec.

- [x] **T02** — Add the warning application workflow and acknowledgement port.
  Define typed results for acknowledged, cancelled, and unavailable UI states.
  Coordinate domain eligibility with the port and retry after cancellation.
  Add application tests with a fake port.
  **Acceptance gate:** application tests cover eligible and ineligible
  warnings, retry until acknowledgement, and completion without waiting when
  UI is unavailable; application imports no Pi or system APIs.

- [x] **T03** — Move Pi event and UI handling into the interface layer. Map
  `model_select` and `session_start` events and Pi context to application
  inputs. Implement the acknowledgement port through the Pi UI. Wire the
  handlers through `src/index.ts` and retain the current default extension
  factory and named `isOpusModelId` export. Add interface and composition
  contract tests.
  **Acceptance gate:** interface tests verify event registration, mapping,
  dialog behavior, cancellation, and unavailable UI; package tests preserve
  current event and mode behavior; `dist/index.js` still exposes the existing
  exports.

- [x] **T04** — Update the package context and check the layer boundaries.
  Record domain, application, and Pi interface responsibilities in
  `packages/pi-model-warning/CONTEXT.md` without changing its behavior rules.
  Review source imports and remove any old logic or tests that duplicate the
  new layer responsibilities.
  **Acceptance gate:** context describes the implemented boundaries; domain
  and application contain no Pi or system API imports; no empty or artificial
  infrastructure component exists; existing warning behavior remains
  covered.

- [x] **T05** — Add a patch changeset and run final checks. Add a changeset for
  `@manuelstolze/pi-model-warning`. Run `npm run typecheck`, `npm run build`,
  `npm test`, `npm run build --workspace @manuelstolze/pi-model-warning`, and
  `npm test -- --run packages/pi-model-warning/test` from the repository root.
  **Acceptance gate:** all listed checks pass; the changeset names the package
  and uses a patch bump; the extension API and user-visible behavior remain
  unchanged. Report any failure and whether it is caused by this change.

## Delivery notes

- **Branch:** `refactor/model-warning-hexagonal-architecture`
- **Commit subject:** `♻️ refactor(model-warning): apply hexagonal architecture`
- **Pull request title:** `♻️ refactor(model-warning): apply hexagonal architecture`
- **Pull request summary:** Separate model-warning rules and workflow policy from Pi event and UI handling without changing warning behavior or the supported extension API.
