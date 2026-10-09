---
id: PERMISSION-GATE-001
domain: permission-gate
services:
  - "@manuelstolze/pi-permission-gate"
product: Pi Integrations Workspace
status: draft
owner: Manuel Stolze
---

# Align Permission Gate Workspace Name

## 1. Problem and intent

The published package is named `@manuelstolze/pi-permission-gate`, but its workspace directory is `packages/permission-gate`. This mismatch makes the package harder to find and gives it a different name from its Pi package slug.

Rename the workspace directory and package-facing labels to use `pi-permission-gate`. Keep the published npm package name unchanged.

## 2. Scope

### In scope

- Rename the workspace directory from `packages/permission-gate` to `packages/pi-permission-gate`.
- Use `Pi Permission Gate` or `@manuelstolze/pi-permission-gate` for package-facing labels.
- Update active workspace paths, links, and metadata to the new directory.
- Add a patch Changeset so the published package metadata points to the new repository directory.
- Keep extension behavior, configuration, APIs, and compatibility requirements unchanged.

### Out of scope

- Renaming the published npm package. It is already named `@manuelstolze/pi-permission-gate`.
- Changing the permission-gate domain term, policy, or implementation module names.
- Changing extension behavior, user configuration, or the Pi extension entry point.
- Rewriting historical records solely to replace a path that was correct when the record was written.

## 3. Requirements

- **FR-001:** The workspace directory for `@manuelstolze/pi-permission-gate` MUST be `packages/pi-permission-gate`.
- **FR-002:** The published npm package name MUST remain `@manuelstolze/pi-permission-gate`.
- **FR-003:** Package-facing labels in current documentation MUST use `Pi Permission Gate` or the full package name. The domain term “permission gate” MUST remain available for descriptions of the capability and its rules.
- **FR-004:** Active workspace references MUST use the new directory. This includes the root TypeScript project reference, the root lockfile workspace paths, the package's `repository.directory` metadata, the context map, package context links, and current architecture references.
- **FR-005:** Historical specifications and records MUST keep old paths when those paths describe the repository as it existed at that time. Current links and instructions MUST point to the new directory.
- **FR-006:** The package MUST keep its current entry point, user configuration, public API, behavior, and compatibility ranges.
- **FR-007:** The change MUST include a patch Changeset to publish the updated repository directory metadata. It MUST NOT rename the npm package or cause a breaking release.

## 4. Capability deltas

- **Modified:** The permission-gate package's workspace path and package-facing label align with its existing `pi-permission-gate` package name.
- **None:** The extension's user-visible behavior, public API, configuration, and supported Pi versions do not change.

## 5. Acceptance criteria

- The package directory is `packages/pi-permission-gate`.
- `@manuelstolze/pi-permission-gate` remains the npm package name and workspace package name.
- Root workspace configuration and lockfile resolve the package from the new directory.
- The package's `repository.directory` metadata points to `packages/pi-permission-gate`.
- Current package links and package-facing labels use the new path and name. Historical records retain accurate past paths.
- A patch Changeset is present. It does not change the package name or supported host versions.
- `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` pass.
- The package behavior and user configuration remain unchanged.

## 6. Domain notes

- **Permission gate** names the capability that checks a command and may pause it for approval.
- **Pi Permission Gate** names this Pi extension package in user-facing package labels.
- The package directory name and published package name are separate identifiers. The published package name is already correct and does not change in this task.

## 7. Events and API contracts

- No Pi events, extension APIs, commands, configuration keys, or model contracts change.
- The package continues to export the same Pi extension entry point.
- Consumers continue to install `@manuelstolze/pi-permission-gate`.

## 8. Open questions

None. The workspace directory and package-facing label change; the npm package name remains unchanged. The owner selected a patch Changeset for the repository metadata update.

## 9. Delivery notes

- **Branch:** `refactor/align-permission-gate-package-path`
- **Commit subject:** `♻️ refactor(permission-gate): align package folder name`
- **Pull request title:** `♻️ refactor(permission-gate): align package folder name`
- **Pull request summary:** Rename the permission-gate workspace folder and update active references and package metadata without changing the published package name or extension behavior.
