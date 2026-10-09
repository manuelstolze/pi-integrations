---
id: MODEL-002
domain: model-warning
services:
  - "@manuelstolze/pi-model-warning"
product: Pi Integrations Workspace
status: approved
owner: Manuel Stolze
---

# Align Model Warning with hexagonal architecture

## 1. Problem and intent

The model-warning extension currently keeps its model rule, warning workflow, and Pi event and dialog handling in one source module. This couples the warning policy to Pi APIs and makes the package boundaries unclear.

Restructure the package to follow the repository's hexagonal architecture. Keep all current warning behavior and the supported extension API unchanged.

## 2. Scope

### In scope

- Separate model-warning rules, warning workflow policy, and Pi-facing behavior into clear responsibilities.
- Keep package rules and workflow policy independent of Pi and system APIs.
- Update package tests to verify the responsibilities and dependency boundaries.
- Update `packages/pi-model-warning/CONTEXT.md` to record the architecture and retained behavior.
- Keep the default extension factory and package entry point stable.

### Out of scope

- Changes to warning triggers, model matching, acknowledgement, or runtime modes.
- New model warning rules, configuration options, or stored warning state.
- Changes to the package's supported public API, package metadata, or README behavior.
- Changes to other packages or shared architecture documents.

## 3. Requirements

- **FR-001:** Model matching rules MUST be independent of Pi APIs and system APIs.
- **FR-002:** Warning workflow policy MUST depend only on model-warning rules and declared interfaces to outside behavior. It MUST NOT depend on Pi APIs or concrete outside-service implementations.
- **FR-003:** Pi event handling, mapping of Pi context to warning workflow input, and warning UI behavior MUST remain in the Pi-facing interface responsibility.
- **FR-004:** Any infrastructure responsibility MUST implement an application interface and MUST remain separate from Pi-facing behavior. The package MUST NOT add infrastructure components that do not serve a real outside-system need.
- **FR-005:** Dependencies MUST point inward. Domain code MUST NOT depend on application, Pi, or system APIs. Application code MUST NOT depend on Pi or system APIs.
- **FR-006:** The package MUST keep the current default extension factory and supported package entry point. Internal rules, workflows, and interfaces MUST NOT become new public APIs.
- **FR-007:** Tests MUST verify model rules without outside services, workflow decisions with fake outside interfaces, and Pi event and UI behavior through the existing extension contract.
- **FR-008:** All current user-visible behavior documented in `packages/pi-model-warning/CONTEXT.md` and `specs/model-warning/001-model-warning/spec.md` MUST remain unchanged.

## 4. Capability deltas

- **Modified:** The package's internal responsibilities and dependency boundaries MUST follow the repository's hexagonal architecture.
- **None:** The extension's user-visible warning capabilities and behavior do not change.

## 5. Acceptance criteria

- Model matching and warning decision rules can be tested without Pi or system APIs.
- Warning workflow tests use fake outside interfaces and do not load Pi APIs or concrete outside services.
- Pi event registration, input mapping, and warning UI behavior are tested through the supported extension contract.
- Source dependencies follow the inward direction required by ADR 0005 and `docs/hexagonal-packages.md`.
- The package has no artificial infrastructure component that does not implement a real outside-system need.
- The default extension factory and supported package entry point remain unchanged.
- Existing tests and updated tests show no change to Opus matching, event triggers, duplicate handling, acknowledgement retry behavior, JSON and print behavior, or retained state.
- `packages/pi-model-warning/CONTEXT.md` describes the new responsibilities and retains the current behavior rules.

## 6. Domain notes

Use the terms and behavior in `packages/pi-model-warning/CONTEXT.md`. An Opus model has `opus` in its model ID, without letter-case sensitivity and regardless of provider. An acknowledgement confirms that the warning was seen; it does not approve, reject, or change the active model.

Follow [`docs/adr/0005-adopt-hexagonal-ddd-architecture.md`](../../../docs/adr/0005-adopt-hexagonal-ddd-architecture.md) and [`docs/hexagonal-packages.md`](../../../docs/hexagonal-packages.md). The application owns workflow policy, the Pi-facing interface handles Pi events and UI, and infrastructure code exists only when a real outside-system implementation is required.

## 7. Events and API contracts

- `model_select` warns only for `set` and `cycle` transitions from a non-Opus model or no previous model to Opus. A restore event does not trigger a separate model-change warning.
- `session_start` warns for `startup`, `new`, `resume`, and `fork` when Opus is active. A reload does not warn.
- TUI and RPC modes wait for explicit acknowledgement and repeat the warning after cancellation or a missing choice.
- JSON and print modes do not request a dialog or wait for acknowledgement.
- A transition between Opus models does not warn. Acknowledgements do not persist across sessions.
- The extension continues to export its default Pi extension factory. It adds no supported API or event contract.

## 8. Open questions

None. The owner approved an architecture-only refactor, unchanged warning behavior and public API, and updates to package context and tests.

## 9. Delivery notes

- **Branch:** `refactor/model-warning-hexagonal-architecture`
- **Commit subject:** `♻️ refactor(model-warning): apply hexagonal architecture`
- **Pull request title:** `♻️ refactor(model-warning): apply hexagonal architecture`
- **Pull request summary:** Separate model-warning rules and workflow policy from Pi event and UI handling without changing warning behavior or the supported extension API.
