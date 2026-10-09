# Model Warning extension context

## Purpose

`@manuelstolze/pi-model-warning` warns users when an Opus model becomes active or a session starts with Opus active.

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
