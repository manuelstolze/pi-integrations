# @manuelstolze/pi-permission-gate

A Pi extension that asks before it runs bash commands that match dangerous patterns. It replaces the permission gate from `pi-guardrails`.

## Compatibility

Requires Node.js 22.19.0 or later, Pi API 1.1.0 or later in the 1.x line, and Pi TUI 1.1.0 or later in the 1.x line. Pi API and Pi TUI 0.x hosts are not supported.

## Install

```bash
npm install @manuelstolze/pi-permission-gate
```

Add the package to your Pi extension configuration:

```json
{
  "pi": {
    "extensions": ["@manuelstolze/pi-permission-gate"]
  }
}
```

>> If you are already using a guardrails extentions, make sure you remove the previous one to avoid duplicate checks.

## Behavior

The extension checks commands in this order:

1. Hard-coded auto-deny rules block a command without a prompt. Allow rules cannot override these checks.
2. File and session allow rules allow a command.
3. Dangerous patterns show a dialog with four choices: allow once, allow this session, allow forever, or deny.
4. If the user denies a command, they can send Pi a steer instruction that says what to do instead.

“Allow this session” applies only to the exact command and ends when the session ends. “Allow forever” saves an anchored regular expression for the exact command.

Without a user interface, the extension blocks dangerous commands. Custom dialog support falls back to Pi's built-in selection dialog when needed.

## Configuration

The extension reads `~/.pi/agent/extensions/guardrails.json` at session start. It creates the directory when it saves an “allow forever” rule. Changes to the file take effect in the next session.

```json
{
  "applyBuiltinDefaults": true,
  "permissionGate": {
    "patterns": [
      { "pattern": "terraform destroy", "description": "Terraform resource deletion" },
      { "pattern": "^kubectl\\s+delete", "regex": true, "description": "Kubernetes deletion" }
    ],
    "allowedPatterns": [
      { "pattern": "^git status$", "regex": true }
    ]
  }
}
```

A pattern uses substring matching by default. Set `regex` to `true` to use a JavaScript regular expression. Invalid regular expressions do not match. Built-in dangerous patterns apply unless `applyBuiltinDefaults` is `false`.

If the file is missing, the extension uses default settings. If it cannot read or validate the file, it shows a warning, uses built-in dangerous patterns, and leaves the file unchanged.

Auto-deny rules use literal substring matching. They do not parse shell syntax. They can miss commands with different spacing and can match text inside quoted strings. Do not treat this check as a complete shell security boundary.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-permission-gate
npm test
```
