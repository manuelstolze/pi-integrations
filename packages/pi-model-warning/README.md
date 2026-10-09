# @manuelstolze/pi-model-warning

A Pi extension that warns when an Opus model is active. It asks for an acknowledgement when Pi enters Opus or starts a session with Opus selected. The warning does not change the selected model.

## Compatibility

Requires Node.js 22.19.0 or later and Pi API 1.1.0 or later in the 1.x line. Pi TUI 1.1.0 or later in the 1.x line is also required by the package's UI peer dependency.

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

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-model-warning
npm test
```
