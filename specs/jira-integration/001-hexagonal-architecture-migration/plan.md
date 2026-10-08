---
id: JIRA-001
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
product: Pi Jira Integration
status: approved
owner: Manuel Stolze
---

# Technical plan: Move Jira integration to hexagonal architecture

## 1. Goal

Restructure `packages/jira-integration` into domain, application, infrastructure, and Pi interface layers. Keep the three read-only tools, authentication flow, output, package entry point, and existing named exports unchanged.

Dependencies must point inward: the domain has no runtime dependencies on Node.js, Pi, or Jira; the application uses domain code and ports; infrastructure and the Pi interface implement the outside connections. `src/index.ts` connects the layers.

## 2. Affected areas

Only `packages/jira-integration` and this change's specification directory are in scope.

| Area | Planned responsibility |
| --- | --- |
| `src/domain/` | Jira result types, pure input rules, limits, and response normalization. No Pi, Node.js, or Jira CLI imports. |
| `src/application/ports/` | Typed ports for search, issue details, and comments. These describe Jira capabilities, not generic command execution. |
| `src/application/use-cases/` | Search, view, and comments workflows. Validate request values, call the relevant port, and return typed results. |
| `src/application/errors.ts` | Stable application errors and codes that do not depend on process or Pi APIs. Preserve the existing `JiraToolError` contract through the public compatibility export. |
| `src/infrastructure/` | Jira CLI command construction and execution, authentication checks and login, JSON response handling, timeouts, cancellation, and token redaction. |
| `src/interface/pi/` | Tool schemas and registration, mapping Pi inputs and abort signals to use cases, and formatting tool output. |
| `src/index.ts` | Composition root. Create the adapters and use cases, register the Pi tools, provide the default extension factory, and re-export the current public API. |
| `test/` | Tests grouped by domain, application, infrastructure, and Pi interface. Keep all tests within this package. |

Keep the current exported `JiraClient` constructor and methods as a compatibility facade over the new internal workflow and adapters. Keep its current option and result types. Re-export the existing normalizers, errors, and types from `src/index.ts`; do not export new internal modules as public API. Keep the compiled entry point at `dist/index.js`.

## 3. Implementation sequence

1. Add domain types, limits, input rules, and pure Jira response normalizers. Move existing normalization logic with behavior-preserving tests.
2. Add application ports and search, view, and comments use cases. Keep command arguments and Node.js APIs out of these modules.
3. Add infrastructure adapters for the Jira CLI and login process. Preserve authentication checks, environment-based login, cancellation, timeout behavior, error mapping, and token redaction.
4. Add a compatibility `JiraClient` facade with the current constructor and method signatures. Delegate to the new application and infrastructure components.
5. Move tool registration, schemas, input mapping, result formatting, and truncation into the Pi interface. Preserve existing names, descriptions, prompts, schemas, and output text.
6. Update `src/index.ts` to compose the adapters and interface and to preserve the default factory and named exports.
7. Split and extend tests by layer. Run package and repository checks, then add a patch changeset for the published package refactor.

Do not change `packages/jira-integration/skills/jira-integration/SKILL.md`, package dependencies, tool behavior, or other packages.

## 4. Contracts and data flow

- The Pi interface maps tool inputs and abort signals to application calls. It formats the typed results into the same text and `details` values as today.
- Application use cases depend on capability-specific ports for issue search, issue details, and comments. They do not build `acli` arguments or call `pi.exec`.
- Infrastructure owns `acli` arguments, process execution, login, JSON decoding, and outside-service failure handling.
- Domain normalization preserves current handling of missing values, Jira text, and malformed response data.
- Jira descriptions and comments remain untrusted data. The interface keeps the current warnings in tool descriptions and formatted output.
- `src/index.ts` retains the default extension factory and all current named exports, including `JiraClient`, normalizers, `JiraToolError`, and exported types.
- No dependency, package entry point, skill, or external tool contract changes.

## 5. Test strategy and gates

### Domain tests

- Test pure normalization, including missing scalar and list values, Jira structured text, and text length limits.
- Test non-empty JQL and issue-key rules and search/comment limit bounds.
- Import no outside service, Pi, or Node.js APIs from domain modules.

### Application tests

- Use fake ports to test search, view, and comments requests and returned values.
- Check invalid input handling and propagation of expected application errors.
- Verify the use cases do not need Pi or command execution.

### Infrastructure tests

- Use fake command and login runners. Do not call Jira or require credentials or network access.
- Check exact CLI arguments and result mapping for search, issue details, and comments.
- Check authenticated access, optional login, failed login, missing CLI, command errors, malformed JSON, timeout, cancellation, and token redaction.
- Check the compatibility `JiraClient` API and behavior.

### Pi interface tests

- Use a fake Pi API and fake application ports or use cases.
- Check registration of the three existing tool names, input mapping, abort-signal forwarding, readable output, structured `details`, and output truncation.
- Check Jira text stays marked as untrusted.

### Required checks

Run these from the repository root:

```bash
npm run typecheck
npm run build
npm test
```

Also run the package test command:

```bash
npm test -- --run packages/jira-integration/test
```

Review the compiled entry point and TypeScript declarations to confirm that the default factory and existing named exports remain unchanged. Do not commit generated `dist/` files.

## 6. Documentation and release impact

- No user-facing README, skill, or context change is planned because usage and behavior remain unchanged.
- Existing rules in `packages/jira-integration/CONTEXT.md`, `docs/hexagonal-packages.md`, and ADR `docs/adr/0005-adopt-hexagonal-ddd-architecture.md` already cover this structure. Do not change them.
- Add a patch changeset for `@manuelstolze/pi-jira-integration`, because this refactor changes the source of a published package while keeping its public behavior stable.
- Do not change dependencies or the root lockfile.

## 7. Risks and controls

- **Behavior drift during extraction:** Keep the existing behavior tests, add layer tests, and compare tool names, schemas, output, and exports before and after the move.
- **Authentication or token exposure changes:** Keep login and token handling in infrastructure. Add tests for cancellation, timeout, and token redaction.
- **Public API drift:** Keep a compatibility facade for `JiraClient` and verify generated declarations and exports.
- **Layer leakage:** Check imports so domain and application do not import Pi, Node.js, or concrete infrastructure modules.

## 8. Delivery notes

- **Branch:** `refactor/jira-integration-hexagonal-migration`.
- **Commit subject:** `♻️ refactor(jira-integration): migrate to hexagonal architecture`.
- **Pull request title:** `♻️ refactor(jira-integration): migrate to hexagonal architecture`.
- **Pull request summary:** Separate Jira rules and workflows from CLI and Pi code without changing Jira behavior or package exports.
