# Pi Permission Gate extension context

## Purpose

`@manuelstolze/pi-permission-gate` replaces the permission gate from `pi-guardrails`. It checks bash commands and asks before it runs commands that match dangerous patterns.

## Terms

- **Permission gate**: A check that pauses a command until the user allows or denies it.
- **Auto-deny rule**: A built-in rule that blocks a command without asking the user.
- **Pattern**: Text or a regular expression that the extension compares with a command.

## Behavior

- Auto-deny rules run before allow rules. A match always blocks the command.
- Allowed patterns and dangerous patterns load from `~/.pi/agent/extensions/guardrails.json` at session start.
- Built-in dangerous patterns apply unless `applyBuiltinDefaults` is `false`.
- A matching dangerous command shows a four-choice dialog.
- “Allow this session” applies to the exact command for the current session.
- “Allow forever” saves an anchored regular expression for the exact command.
- Denial can include an instruction that Pi receives as a steer message.
- Auto-deny matching uses literal substring checks. It does not parse shell syntax.
- Bad config data causes a warning and uses built-in dangerous patterns. The extension does not overwrite the bad file.

## Architecture

- Pure command rules do not use Pi APIs or file APIs.
- The application applies permission rules through ports for configuration, approval, and session approvals.
- The interface layer handles Pi events, prompts, and session approvals.
- The infrastructure layer reads and writes `guardrails.json`.

## Package conventions

- The package entry point is `dist/index.js`.
- The package declares the entry point in `pi.extensions`.
- Pi and Pi TUI are peer dependencies.
- Tests cover pattern checks, config handling, and command decisions.
