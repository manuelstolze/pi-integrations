---
status: accepted
date: 2026-10-07
approvers:
  - Manuel Stolze
last_reviewed: "2026-10-07 — valid"
---

# ADR 0008 — Declare Pi API packages as peer dependencies

## TL;DR

We propose that extension packages declare Pi API packages as peer dependencies and as development dependencies for local builds and tests. This makes each package's supported Pi version range explicit and keeps the host API outside the extension package.

## Context

Pi loads these packages as extensions and provides the Pi APIs they use. Each package must work with a compatible Pi API version. The current packages declare `@earendil-works/pi-coding-agent` as a peer dependency with the range `>=0.85.1 <1`, and also as a development dependency for workspace builds and tests. The permission-gate package also declares `@earendil-works/pi-tui` as a peer and development dependency.

**Scope:** This decision covers Pi API packages supplied by the Pi host. It does not cover other runtime dependencies, such as `typebox`.

## Options in scope

1. **Peer dependencies** — Declare the required Pi API packages and supported version range. Also install them as development dependencies in the workspace.
2. **Bundle Pi API packages** — Include the Pi API code in each extension package.
3. **Regular runtime dependencies** — Declare Pi API packages as dependencies so package installation installs them for the extension.

### Comparison

| Criterion | Peer dependencies | Bundle Pi API packages | Regular runtime dependencies |
| --- | --- | --- | --- |
| Host compatibility | ✅ Declares the supported host API range. | ⚠️ Ships an API copy that may differ from the host version. | ⚠️ Installs a package version that may differ from the host version. |
| Install simplicity | ⚠️ Requires a compatible Pi API package to be available from the host. | ✅ The extension package carries its API code. | ✅ Package installation fetches its API dependency. |
| Release control | ⚠️ The host provides the API version; the extension declares its supported range. | ✅ The extension package fixes the bundled API version. | ✅ The extension declares its own dependency range. |

Legend: ✅ good · ⚠️ neutral / caveat · ❌ bad · ⚪ n/a

## Decision

We propose that packages keep Pi API packages as peer dependencies and declare the same packages as development dependencies for workspace builds and tests. Each peer dependency must state the supported version range. The Pi API packages remain external to the published extension package.

## Consequences

- **Positive:** Package metadata states which Pi API versions each extension supports. Extensions use the API provided by the Pi host instead of bundling another copy.
- **Negative / trade-offs:** A user or host must provide a compatible Pi API package. The extension package cannot independently choose or bundle its Pi API version.
- **Follow-ups:** Keep each package's peer and development dependency ranges aligned. Update the ranges when the extension supports a changed Pi API range.

## Alternatives considered

- **Bundle Pi API packages** — Not chosen because an extension could ship a different copy from the API supplied by the host.
- **Regular runtime dependencies** — Not chosen because the extension could install a Pi API version separate from the one provided by the host.
