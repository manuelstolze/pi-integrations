---
status: accepted
date: 2026-10-07
approvers:
  - Manuel Stolze
last_reviewed: "2026-10-07 — valid"
---

# ADR 0006 — Use a layered permission gate for Bash commands

## TL;DR

The permission-gate extension uses fixed auto-deny rules for selected high-risk commands, then configurable pattern rules that ask the user for approval. This balances blocking known dangerous commands with user control, without prompting for every Bash command. Pattern matching is not a complete shell security boundary.

## Context

The extension checks Bash tool calls before execution. It must block selected commands without allowing an allow rule to override the block, and it must let a user decide what to do when a command matches a dangerous pattern. A pattern check is simpler to configure than interpreting full shell syntax, but it can miss command variations or match text that is not an executed command.

**Scope:** This decision covers the permission-gate policy for Bash commands in `packages/permission-gate`. It does not claim to provide a complete security boundary for shell commands.

## Options in scope

1. **Layered pattern gate** — Block selected commands with fixed rules. Ask for approval when a command matches a dangerous pattern. Allow other commands.
2. **Shell-aware policy** — Parse shell syntax before applying command rules. This can distinguish more command forms, but adds complexity and still does not isolate command effects.
3. **Prompt for every Bash command** — Ask before every command. This avoids relying on a dangerous-pattern list, but adds prompts for routine work and does not explain command effects.

### Comparison

| Criterion | Layered pattern gate | Shell-aware policy | Prompt every command |
| --- | --- | --- | --- |
| Risk protection | ⚠️ Blocks selected commands; text checks can miss variants. | ⚠️ Sees more command structure, but does not isolate effects. | ⚠️ Prompts for each command; the user must judge it. |
| Match accuracy | ❌ Uses substring and regular-expression checks. | ✅ Uses parsed structure, subject to parser limits. | ⚪ Does not match against patterns. |
| User control | ✅ Offers allow once, this session, forever, or deny. Auto-deny rules cannot be overridden. | ⚠️ Depends on the policy and approval design. | ✅ Offers a decision for every command. |
| Maintenance effort | ✅ Maintains fixed rules and user-editable patterns. | ❌ Adds a shell parser and syntax rules. | ✅ Does not need dangerous-pattern rules. |

Legend: ✅ good · ⚠️ neutral / caveat · ❌ bad · ⚪ n/a

## Decision

We will use the layered pattern gate. Fixed auto-deny rules run first and cannot be overridden by allow rules. Allowed patterns run next. A command that matches a dangerous pattern requires approval; other commands pass through. Pattern checks use literal substring matching or configured JavaScript regular expressions. The extension will block a dangerous command if approval is not available.

## Consequences

- **Positive:** Selected high-risk commands are blocked without relying on a prompt. Users can approve other matched commands for one use, one session, or future use.
- **Negative / trade-offs:** Text matching does not parse shell syntax. It can miss alternate command forms or match text inside quoted strings. The gate does not make arbitrary shell execution safe.
- **Follow-ups:** Keep the package README clear that the gate is not a complete shell security boundary. Revisit this decision if the extension needs to reason about shell command structure or provide stronger isolation.

## Alternatives considered

- **Shell-aware policy** — Not chosen because parsing shell syntax adds complexity and still does not isolate command effects.
- **Prompt for every Bash command** — Not chosen because it requires approval for routine commands and shifts the risk judgment to the user for every call.
