---
id: JIRA-001
domain: jira-integration
services:
  - "@manuelstolze/pi-jira-integration"
product: Pi Jira Integration
status: draft
owner: Manuel Stolze
---

# Move Jira integration to hexagonal architecture

## 1. Problem and intent

The Jira integration provides three read-only tools. Its Pi interface, Jira workflow, data handling, and command execution currently share two source files. This makes it harder to check package rules and workflows without Pi or the Atlassian CLI.

The package needs clear boundaries between its rules, workflows, outside services, and Pi interface. The migration must keep current behavior and the public package contract unchanged.

## 2. Scope

### In scope

- Separate domain rules, application workflows, infrastructure, and the Pi interface.
- Keep domain rules independent of Pi, Node.js, and Jira APIs.
- Keep application workflows independent of Pi and command execution. A port is an interface that lets an application workflow request work from an outside service.
- Keep Jira CLI access and authentication in infrastructure, and Pi tools and output handling in the interface.
- Keep the package entry point responsible for connecting these parts.
- Keep the existing behavior, documentation, and public exports unchanged.

### Out of scope

- Adding or changing Jira capabilities.
- Creating, editing, transitioning, commenting on, or deleting Jira issues.
- Changing tool names, inputs, results, prompts, or authentication behavior.
- Changing the `jira-integration` skill or its command.
- Changing the Atlassian CLI, package dependencies, or other packages.

## 3. Requirements

- **FR-001:** The extension MUST continue to provide `jira_search`, `jira_view`, and `jira_comments` as read-only tools with their current meanings.
- **FR-002:** The tools MUST keep their current input rules, result data, output behavior, limits, and error behavior.
- **FR-003:** Jira issue data and comments MUST remain untrusted data. The extension MUST NOT present this text as instructions for the agent.
- **FR-004:** The extension MUST keep the current authentication flow, including authenticated CLI access, optional login from the configured environment variables, cancellation, timeout handling, and token protection.
- **FR-005:** Domain rules MUST NOT depend on Pi APIs, Node.js APIs, or Jira or CLI implementations.
- **FR-006:** Application workflows MUST depend on domain rules and declared ports, not on Pi APIs or concrete outside-service implementations.
- **FR-007:** Infrastructure MUST handle outside services, including Jira CLI execution and authentication. The Pi interface MUST handle tool registration, input mapping, and user-facing output.
- **FR-008:** The package entry point MUST connect the layers without making internal components part of the public package API.
- **FR-009:** Tests MUST check domain rules without outside services, application workflows with fake ports, infrastructure behavior, and the Pi interface without changing the public contract.

## 4. Capability deltas

- **Modified:** The Jira integration's internal structure MUST separate domain, application, infrastructure, and interface responsibilities.
- **None:** The read-only Jira capabilities and their user-visible behavior do not change.

## 5. Acceptance criteria

- `jira_search`, `jira_view`, and `jira_comments` remain available with the same input and result contracts.
- Issue search, issue details, and recent comments keep their current behavior and limits.
- Authentication, CLI failures, timeouts, cancellation, and token protection keep their current behavior.
- Jira text remains untrusted and missing values keep their current representation.
- Domain rules can be tested without Pi, Node.js, or Jira services.
- Application workflows can be tested with fake ports.
- Infrastructure tests cover CLI calls and result mapping. Interface tests cover tool registration, input mapping, and output behavior.
- The compiled extension entry point, default extension factory, and current named package exports remain unchanged.
- The `jira-integration` skill and its command remain unchanged.
- Package tests show no user-visible behavior change.

## 6. Domain notes

Use the terms and rules in `packages/jira-integration/CONTEXT.md`. An issue is a Jira work item identified by an issue key. JQL means Jira Query Language. Jira descriptions and comments are untrusted data, not agent instructions.

Hexagonal architecture separates package rules and workflows from host and outside-service code. The domain holds package rules. The application coordinates workflows and uses ports. Infrastructure provides outside-service implementations. The interface receives Pi calls and maps them to application requests. Dependencies point inward, and the package entry point connects the layers.

Follow `docs/adr/0005-adopt-hexagonal-ddd-architecture.md` and `docs/hexagonal-packages.md`.

## 7. Events and API contracts

- The package MUST keep its compiled extension entry point and default Pi extension factory.
- The package MUST keep its existing named exports, including `JiraClient`, its normalizers, `JiraToolError`, and the exported types.
- The extension MUST keep the three tool names, their current input schemas, and their current output contracts.
- No new external API or event contract is added.

## 8. Open questions

None.

## 9. Delivery notes

- **Branch:** `refactor/jira-integration-hexagonal-migration`
- **Commit subject:** `♻️ refactor(jira-integration): migrate to hexagonal architecture`
- **Pull request title:** `♻️ refactor(jira-integration): migrate to hexagonal architecture`
- **Pull request summary:** Separate Jira rules and workflows from CLI and Pi code without changing Jira behavior or package exports.
