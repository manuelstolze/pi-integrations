---
id: MODEL-002
domain: model-warning
services:
  - "@manuelstolze/pi-model-warning"
status: approved
owner: Manuel Stolze
---

# Technical plan: Align Model Warning with hexagonal architecture

## 1. Approach

Keep the refactor inside `packages/pi-model-warning`. Split the current `src/index.ts` responsibilities into pure model-warning rules, application workflows, and a Pi-facing interface. Keep `src/index.ts` as the composition root. It connects the Pi extension to the application and exports the current extension API.

The application will declare an acknowledgement port. Its workflow will use domain rules to decide whether to warn, then request acknowledgement through that port. The Pi interface will implement the port with `ExtensionContext`, map Pi events to application input, and register the event handlers. It will report an unavailable UI without waiting in JSON and print modes. The application will retry after cancellation and finish only after acknowledgement or an unavailable UI result.

The package has no file, process, or external provider service. Do not add an `infrastructure/` module or empty folder. Keep the Pi API integration in `interface/pi/`.

Keep all existing warning behavior, package metadata, and supported exports unchanged. The current named `isOpusModelId` export is part of the published entry point, so `src/index.ts` must continue to export it. Do not expose other internal modules.

## 2. Source layout changes

Add the following responsibilities under `packages/pi-model-warning/src/`:

| Area | Responsibility |
| --- | --- |
| `domain/` | Model-warning types and pure rules for Opus matching and warning eligibility. |
| `application/ports/` | The typed acknowledgement capability required by the warning workflow. |
| `application/use-cases/` | Coordinate warning eligibility and acknowledgement, including retry after cancellation. |
| `interface/pi/` | Register `model_select` and `session_start`; map Pi events and context to application input; provide the Pi UI implementation of the acknowledgement port. |
| `index.ts` | Compose the Pi interface and application dependencies; export the existing default extension factory and named `isOpusModelId` helper. |

Keep `packages/pi-model-warning/package.json`, its TypeScript project settings, compiled entry point, and peer dependencies unchanged. Tests remain under `packages/pi-model-warning/test/`. Do not add an infrastructure layer because the package has no non-Pi outside service to implement.

## 3. Test changes

Replace the single entry-point test file with tests grouped by responsibility:

- **Domain tests:** cover case-insensitive Opus matching and warning eligibility for model-selection sources, previous models, session-start reasons, and current model state. Use no fakes or outside APIs.
- **Application tests:** use a fake acknowledgement port. Cover eligible and ineligible inputs, retry after cancellation, completion after acknowledgement, and completion without waiting when the port reports that UI is unavailable.
- **Interface tests:** use fake Pi APIs and contexts. Cover event registration, event and context mapping, dialog text and acknowledgement choice, cancellation mapping, unavailable UI mapping, and unchanged extension behavior.
- **Composition contract tests:** confirm the default extension factory and named `isOpusModelId` export remain available from `src/index.ts`.

Keep coverage for current behavior: restore does not create a second model-change warning; startup, new, resume, and fork can warn; reload does not; Opus-to-Opus changes do not; cancellation repeats the warning; JSON and print modes do not request UI; acknowledgements are not stored.

## 4. Contracts and documentation

- Keep the default extension factory, named `isOpusModelId` export, package name, compiled entry point, package metadata, and Pi event contracts unchanged.
- Keep the warning text and acknowledgement choice unchanged.
- Update `packages/pi-model-warning/CONTEXT.md` to describe the layer responsibilities and dependency direction. Keep its existing domain terms and behavior rules.
- Leave the package README and shared architecture documents unchanged.
- Add a patch changeset for `@manuelstolze/pi-model-warning`. The package's published build changes, but its supported behavior and API do not.

## 5. Dependency rules

Check imports after the refactor and keep these rules:

- `domain/` imports no application, Pi, or system APIs.
- `application/` imports domain rules and its own ports only. It imports no Pi APIs or concrete UI implementation.
- `interface/pi/` imports application contracts and Pi APIs. It maps Pi-specific values to application inputs and supplies the acknowledgement port.
- `src/index.ts` wires the interface and application. It adds no warning policy.
- No `infrastructure/` module is added unless planning uncovers a real non-Pi outside service; if one is needed, stop and ask the owner before changing the approved scope.

## 6. Validation gates

Run these commands from the repository root:

1. `npm run typecheck`
2. `npm run build`
3. `npm test`
4. `npm run build --workspace @manuelstolze/pi-model-warning`
5. `npm test -- --run packages/pi-model-warning/test`

Also review source imports against the dependency rules above. Confirm that the package still builds `dist/index.js`, exports the default extension factory and named `isOpusModelId`, and registers the same Pi events. Report any failing check and state whether it is caused by this change.

## 7. Delivery notes

- **Branch:** `refactor/model-warning-hexagonal-architecture`
- **Commit subject:** `♻️ refactor(model-warning): apply hexagonal architecture`
- **Pull request title:** `♻️ refactor(model-warning): apply hexagonal architecture`
- **Pull request summary:** Separate model-warning rules and workflow policy from Pi event and UI handling without changing warning behavior or the supported extension API.
