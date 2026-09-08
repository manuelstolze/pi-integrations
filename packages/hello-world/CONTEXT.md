# Hello World extension context

## Purpose

`@manuelstolze/pi-hello-world` is the example Pi extension and the template for new packages in this repository.

## Terms

- **Slash command**: A command that a user runs in a Pi session with a leading `/`.
- **Command handler**: The function that processes a slash command's arguments and context.
- **Notification**: A message shown through the Pi user interface.

## Behavior

- The extension registers the `/hello` slash command.
- The command accepts an optional name.
- The command trims the provided name.
- The command uses `world` when the name is empty.
- The command sends a greeting through `ctx.ui.notify`.

## Extension interface

- The default export is an `ExtensionFactory`.
- The factory receives the Pi `ExtensionAPI`.
- The factory registers the command with `pi.registerCommand`.
- The command handler receives the argument string and an `ExtensionCommandContext`.

## Package conventions

- The package entry point is `dist/index.js`.
- The package declares that entry point in `pi.extensions`.
- The package README documents installation, usage, and development.
- Tests cover command registration, a named greeting, and the default greeting.
