# @manuelstolze/pi-model-warning

A Pi extension that warns when an Opus model is active. It asks for an acknowledgement when Pi enters Opus or starts a session with Opus selected. The warning does not change the selected model.

See [the package glossary](./GLOSSARY.md) for warning terms.

## Compatibility

Requires Node.js 22.19.0 or later and Pi API 1.3.0 or later in the 1.x line.
Pi TUI 1.3.0 or later in the 1.x line is also required by the package's UI peer
dependency. Pi API and Pi TUI versions below 1.3.0 are not supported.

## Install

```bash
npm install @manuelstolze/pi-model-warning
```

Add the package to your Pi extension configuration:

```json
{
  "pi": {
    "extensions": ["@manuelstolze/pi-model-warning"]
  }
}
```

## Behavior

The extension matches `opus` anywhere in the model ID. The match ignores letter case and does not depend on the provider.

In TUI and RPC modes, Pi waits for you to select **I understand — continue**. If you cancel the dialog, it appears again. Acknowledgement does not select, reject, or change a model.

The extension warns when Pi changes from a non-Opus model to an Opus model. It also warns when a session starts, is created, resumed, or forked with Opus active. It does not warn on an Opus-to-Opus change or an extension reload. A model restore uses the session-start warning, not a second model-change warning.

In JSON and print modes, the extension does not show a dialog and does not wait. It does not keep acknowledgements across sessions. It has no configuration options and warns only for Opus.

### Pi event rules

- `model_select` warns only for `set` and `cycle` events that change from a non-Opus model, or no previous model, to Opus.
- A transition from one Opus model to another does not warn.
- `model_select` events with source `restore` do not warn. Session restore warnings use `session_start`.
- `session_start` warns for `startup`, `new`, `resume`, and `fork` when the active model is Opus. It ignores `reload`.
- A cancelled or missing acknowledgement choice repeats the warning in TUI and RPC modes.
- The extension stores no warning state.

## Architecture

- `src/domain/` owns Opus matching and warning eligibility rules. It does not import Pi or system APIs.
- `src/application/` owns the warning workflow and declares the acknowledgement port. It depends on domain rules and does not import Pi APIs.
- `src/interface/pi/` registers Pi events, maps Pi input, and handles acknowledgement dialogs. It implements the application's acknowledgement port.
- `src/index.ts` connects the application workflow and Pi interface, then exports the extension.
- The package has no `infrastructure/` layer because it has no file, process, or external service adapter. Pi APIs belong to the interface layer.
- Dependencies point inward. Domain code does not depend on application or interface code.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-model-warning
npm test
```
