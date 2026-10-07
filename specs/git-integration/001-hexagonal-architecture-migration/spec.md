---
id: GIT-001
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: Manuel Stolze
---

# Move Git integration to hexagonal architecture

## 1. Problem and intent

The Git integration already separates domain rules and application workflows. Its outside code still sits in a shared `adapters` area. This groups Pi-facing code with Git, hosting-provider, and process code.

The extension needs clear boundaries between its domain rules, workflows, outside services, and Pi interface. This change must keep the current user-visible behavior and public extension API unchanged.

## 2. Scope

### In scope

- Clarify the four internal areas: domain, application, infrastructure, and interface.
- Keep package rules and workflows independent of Pi and system APIs.
- Keep the extension's current commands, provider behavior, and public API unchanged.
- Keep the package's intended public extension entry point stable.

### Out of scope

- New or changed Git, GitHub, GitLab, or Herald features.
- Changes to command names, command arguments, prompts, or user-visible results.
- Changes to other extension packages.
- Changes to the package's published API beyond internal structure.

## 3. Requirements

- **FR-001:** The extension MUST keep the `/herald` command and its `commit`, `request`, and full-flow modes. Their current meanings MUST remain unchanged.
- **FR-002:** The extension MUST keep its current provider selection and access checks, duplicate review-request prevention, confirmations, and repository-rule handling.
- **FR-003:** Domain rules MUST remain independent of Pi APIs, Node.js APIs, and provider APIs.
- **FR-004:** Application workflows MUST express user goals and policy. They MUST depend on domain rules and declared ports, not on Pi, process, Git, or hosting-provider implementations.
- **FR-005:** Infrastructure responsibilities MUST cover outside services such as Git, GitHub, GitLab, and process execution. Pi-specific commands, events, prompts, session state, and output MUST remain separate from those responsibilities.
- **FR-006:** The package MUST keep its public extension API stable. Internal ports, workflows, and adapters MUST NOT become public library APIs unless consumers need them as supported APIs.
- **FR-007:** Tests MUST be able to check domain rules without outside services, application workflows with fake ports, and the Pi interface without changing the public extension contract.

## 4. Capability deltas

- **Modified:** The internal architecture of the Git integration MUST use separate domain, application, infrastructure, and interface responsibilities.
- **None:** User-visible Git integration capabilities and their behavior do not change.

## 5. Acceptance criteria

- The extension registers and runs `/herald`, `/herald commit`, and `/herald request` with the same behavior as before the migration.
- Provider selection, access checks, duplicate review-request checks, confirmation steps, and repository-rule handling keep their current behavior.
- Domain rules can run without Pi or system APIs.
- Application workflows can run against fake ports and do not depend on concrete outside-service implementations.
- Pi-specific behavior is distinct from Git, provider, and process behavior.
- The extension keeps the same supported public entry point and does not expose internal components as new public APIs.
- Package tests cover the layer responsibilities and show no user-visible behavior change.

## 6. Domain notes

Use the terms and current behavior in `packages/git-integration/CONTEXT.md`. A review request means a GitHub pull request or a GitLab merge request. Herald modes are `commit`, `request`, and `full`.

The architecture must follow `docs/adr/0005-adopt-hexagonal-ddd-architecture.md` and `docs/hexagonal-packages.md`. Dependencies point inward: infrastructure and interface depend on application and domain; application depends on domain.

## 7. Events and API contracts

- The extension continues to export its default Pi extension factory.
- The `/herald` command and its supported mode arguments do not change.
- No new external API or event contract is added.

## 8. Open questions

None. The scope is a structure-only migration of `packages/git-integration`.

## 9. Delivery notes

- **Branch:** `refactor/001-hexagonal-architecture-migration`
- **Commit subject:** `♻️ refactor(git-integration): migrate to hexagonal architecture`
- **Pull request title:** `♻️ refactor(git-integration): migrate to hexagonal architecture`
- **Pull request summary:** Separate Git rules and workflows from Pi, Git, provider, and process code without changing Git integration behavior or its public API.
