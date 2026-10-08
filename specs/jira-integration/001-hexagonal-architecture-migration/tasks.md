---
id: JIRA-001
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
product: Pi Jira Integration
status: approved
owner: Manuel Stolze
---

# Tasks: Move Jira integration to hexagonal architecture

Complete tasks in order unless a task has no dependency on the task before it. Keep the existing tool behavior and public package API unchanged.

## Implementation tasks

- [x] **T01** — Extract Jira types, limits, input rules, and response normalization into `src/domain/`. Keep domain modules free of Pi, Node.js, and Jira CLI imports. Add domain tests for input rules, result normalization, missing values, structured Jira text, and truncation. **Acceptance gate:** Domain tests pass, and source inspection confirms that domain modules import no outside-service or host APIs.

- [x] **T02** — Define capability-specific ports and search, view, and comments use cases in `src/application/`. Have each use case validate its input, call its port, and return typed results without building CLI arguments. Add fake-port tests for valid requests, invalid inputs, and returned results. **Acceptance gate:** Application tests pass using fake ports, and application modules do not import Pi or concrete infrastructure.

- [x] **T03** — Implement Jira CLI and login adapters in `src/infrastructure/`. Move command arguments, JSON decoding, authentication, environment-based login, cancellation, timeouts, error mapping, and token redaction out of the current client. Add fake-runner tests for command arguments and results, auth and login paths, missing CLI, command failures, malformed JSON, cancellation, timeouts, and token protection. **Acceptance gate:** Infrastructure tests pass without Jira credentials, network access, or a real CLI; no token appears in errors or results.

- [x] **T04** — Add the `JiraClient` compatibility facade with its existing constructor, methods, options, and result types. Delegate its work to the application and infrastructure layers. Keep the existing client tests and add coverage where needed for exported behavior and error handling. **Acceptance gate:** Existing callers can use `JiraClient` as before, and client tests pass.

- [x] **T05** — Move Pi tool schemas, registration, input mapping, abort-signal forwarding, output formatting, and truncation into `src/interface/pi/`. Add interface tests using a fake Pi API and fake application dependencies. **Acceptance gate:** Tests confirm the same three tool names, schemas, descriptions, prompts, result text, `details`, untrusted-data warnings, and truncation behavior.

- [x] **T06** — Update `src/index.ts` to compose the infrastructure adapters and application use cases with the Pi interface. Preserve the default extension factory, `dist/index.js` entry point, and every current named export. **Acceptance gate:** TypeScript declarations and built exports match the existing public contract; package tests pass.

- [x] **T07** — Run the required package and repository checks, review import direction, and add a patch changeset for `@manuelstolze/pi-jira-integration`. Do not commit generated `dist/` files or change dependencies, the skill, or other packages. **Acceptance gate:** `npm run typecheck`, `npm run build`, `npm test`, and `npm test -- --run packages/jira-integration/test` pass; the changeset names the Jira package and requests a patch release.

## Delivery notes

- **Branch:** `refactor/jira-integration-hexagonal-migration`.
- **Commit subject:** `♻️ refactor(jira-integration): migrate to hexagonal architecture`.
- **Pull request title:** `♻️ refactor(jira-integration): migrate to hexagonal architecture`.
- **Pull request summary:** Separate Jira rules and workflows from CLI and Pi code without changing Jira behavior or package exports.
