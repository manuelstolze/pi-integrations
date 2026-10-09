# Model Warning extension context

## Purpose

`@manuelstolze/pi-model-warning` warns users when an Opus model becomes active or a session starts with Opus active.

## Architecture

- `src/domain/` owns Opus matching and warning eligibility rules. It does not import Pi or system APIs.
- `src/application/` owns the warning workflow and declares the acknowledgement port. It depends on domain rules and does not import Pi APIs.
- `src/interface/pi/` registers Pi events, maps Pi input, and handles acknowledgement dialogs. It implements the application's acknowledgement port.
- `src/index.ts` connects the application workflow and Pi interface, then exports the extension.
- The package has no `infrastructure/` layer because it has no file, process, or external service adapter. Pi APIs belong to the interface layer.
- Dependencies point inward. Domain code does not depend on application or interface code.

## Terms

- **Opus model**: A model whose ID contains `opus`, without letter-case sensitivity. Provider does not affect the match.
- **Acknowledgement**: A user action that confirms the warning was seen. It does not approve, reject, or change the active model.

## Behavior

- `model_select` warns only for `set` and `cycle` events that change from a non-Opus model, or no previous model, to Opus.
- A transition from one Opus model to another does not warn.
- `model_select` events with source `restore` do not warn. Session restore warnings use `session_start`.
- `session_start` warns for `startup`, `new`, `resume`, and `fork` when the active model is Opus. It ignores `reload`.
- TUI and RPC modes wait for the acknowledgement choice. A cancelled or missing choice repeats the warning.
- JSON and print modes do not request a dialog and do not wait.
- Acknowledgements do not persist across sessions. The extension stores no warning state.
- The extension warns only for Opus and has no configuration options.
