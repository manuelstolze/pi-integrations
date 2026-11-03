# @manuelstolze/pi-hello-world

An example [Pi coding agent](https://github.com/earendil-works/pi) extension. It registers a `/hello [name]` slash command that shows a friendly notification, and exists as a template for building new extensions in this monorepo.

See [the package glossary](./GLOSSARY.md) for Hello World terms.

## Compatibility

Requires Node.js 22.19.0 or later and Pi API 1.3.0 or later in the 1.x line.
Pi API versions below 1.3.0 are not supported.

## Install

```bash
npm install @manuelstolze/pi-hello-world
```

Then add it to your Pi configuration (e.g. `package.json` `pi.extensions`, or `~/.config/pi/config.json`):

```json
{
  "pi": {
    "extensions": ["@manuelstolze/pi-hello-world"]
  }
}
```

## Usage

Inside a Pi session, run:

```
/hello Ada
```

The command trims the supplied name. It uses `world` if the name is empty.
The greeting is a notification, a message shown through the Pi user interface.

## Extension interface

The default export is an `ExtensionFactory`. The factory receives the Pi
`ExtensionAPI` and registers `/hello` with `pi.registerCommand`.
The command handler is the function that processes the command arguments and
context. It receives the argument string and an `ExtensionCommandContext`, then
sends the greeting through `ctx.ui.notify`.

The compiled entry point is `dist/index.js`, declared in `pi.extensions`.
Tests cover command registration, a named greeting, and the default greeting.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-hello-world
npm test
```
