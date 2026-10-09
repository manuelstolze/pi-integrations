---
id: MODEL-001
domain: model-warning
services:
  - "@manuelstolze/pi-model-warning"
product: Pi Integrations Workspace
status: approved
owner: Manuel Stolze
---

# Model Warning

## 1. Problem and intent

Users need to notice when Pi enters a model that the extension warns about and when a session starts on one. Show a blocking warning and require an explicit acknowledgement before Pi continues work. The warning must not change or reject the selected model.

This package can support warning rules for more models in future releases. This release warns only for Opus.

## 2. Scope

### In scope

- Add a separately installable Pi extension package named `@manuelstolze/pi-model-warning` under `packages/`.
- In this release, warn when a selected model ID contains `opus`, without case sensitivity and regardless of provider.
- Warn when the active model changes from a non-Opus model, or no model, to an Opus model.
- Warn when a session starts, is created, resumed, or forked with an Opus model active.
- Require explicit acknowledgement in TUI and RPC modes. If the user dismisses the warning without acknowledgement, show it again. Only acknowledgement completes the warning flow.
- In JSON and print modes, do not show a dialog or block work.
- Show the warning again on each later transition into Opus and each later session start, create, resume, or fork on Opus.
- Do not add an option to disable the warning or retain acknowledgements across sessions.
- Document package installation, use, and development in the package README.

### Out of scope

- Warning about models other than Opus in this release.
- Preventing or reverting selection of an Opus model.
- Offering a skip, decline, or dismiss action that lets work continue.
- Warning about model IDs that do not contain `opus`.
- Changing provider configuration, Pi settings, or Pi's built-in dialogs.
- Adding a root-level global extension outside the package workspace.

## 3. Requirements

- **FR-001:** In this release, a model is an Opus model when its model ID contains `opus`, without case sensitivity. The provider must not affect this match.
- **FR-002:** When the active model changes from a non-Opus model or no model to an Opus model, Pi must wait for one acknowledgement warning before the model-change flow completes.
- **FR-003:** When a session starts, is created, resumed, or forked with an Opus model active, Pi must wait for one acknowledgement warning before work continues. An extension reload alone must not trigger a warning.
- **FR-004:** A transition from one Opus model to another Opus model must not trigger a warning.
- **FR-005:** The warning must state that an Opus model is active and provide an acknowledgement action. It must not ask whether to use Opus. Acknowledgement must not change the selected model.
- **FR-006:** In TUI and RPC modes, only explicit acknowledgement completes the warning flow. Dismissal or cancellation must show the warning again and must not let work continue.
- **FR-007:** In RPC mode, the extension must wait for the dialog response. A cancelled response must not count as acknowledgement.
- **FR-008:** In JSON and print modes, the extension must not request a dialog and must continue without waiting for acknowledgement.
- **FR-009:** If one session start or restore reports the same active Opus model through more than one Pi event, it must show one warning for that session transition. This rule must not suppress a later, separate transition into Opus.
- **FR-010:** The extension must not retain acknowledgements across sessions. Each later transition into Opus and each later session start, creation, resume, or fork on Opus must show the warning again.
- **FR-011:** The extension package must be named `@manuelstolze/pi-model-warning`, follow the repository's package conventions, and be installable as an independent Pi package.
- **FR-012:** This release must warn only for Opus. It must not add configuration or behavior for other model warning rules.

## 4. Capability deltas

- **Added:** Notify the user and require acknowledgement when Pi enters Opus or starts, creates, resumes, or forks a session on Opus.
- **Added:** Provide the warning as an independently installable Pi extension package named `@manuelstolze/pi-model-warning`.

## 5. Acceptance criteria

- An ID such as `vendor/Model-Opus-Next` triggers a warning, regardless of provider or letter case.
- Selecting Opus from a non-Opus model or from no active model shows one blocking warning in TUI and RPC modes.
- The Opus model remains selected while the warning is open and after acknowledgement.
- Dismissing or cancelling the warning does not continue work. The warning appears again until the user acknowledges it.
- Starting, creating, resuming, or forking a session with Opus active shows one warning. An extension reload does not show a warning by itself.
- If restore and session-start events report the same Opus model for one session transition, they produce one warning, not two.
- Changing from one Opus model to another shows no warning.
- Changing away from Opus and later back to Opus shows the warning again.
- JSON and print modes do not request a dialog and do not wait for acknowledgement.
- The package is named `@manuelstolze/pi-model-warning`, has its own source, tests, package README, and standard Pi package metadata under `packages/`.
- This release does not warn for models other than Opus and adds no model-warning configuration.
- Existing settings and provider configuration remain unchanged.

## 6. Domain notes

- An **Opus model** is a model whose ID contains `opus`, without case sensitivity.
- An **acknowledgement** confirms that the user saw the warning. It does not grant or deny permission to use the model.
- A warning is blocking when Pi waits for explicit acknowledgement before it completes the related model-change or session-start flow.
- When Pi selects an Opus model, that model stays active while the warning is open. The warning does not prevent or undo model selection.

## 7. Events and API contracts

- Pi's `model_select` event reports the selected model, the previous model when one exists, and the selection source. The extension must use this behavior to detect model changes.
- Pi's `session_start` event reports startup, reload, new, resume, and fork reasons. A reload alone must not warn.
- TUI and RPC modes support blocking dialogs. RPC clients must answer Pi's extension UI request for acknowledgement to complete the warning flow.
- JSON and print modes do not support dialogs. The extension must continue without requesting one.
- A cancelled or missing acknowledgement is not acknowledgement.

## 8. Open questions

None. The package name, initial Opus-only scope, dismissal behavior, and duplicate-warning rule are defined above.

## 9. Delivery notes

- **Branch:** `feat/pi-model-warning`
- **Commit subject:** `✨ feat(model-warning): add Opus warning rule`
- **Pull request title:** `✨ feat(model-warning): add Opus warning rule`
- **Pull request summary:** Add an installable Pi model-warning package. Its first rule warns and waits for acknowledgement when a session enters Opus.
