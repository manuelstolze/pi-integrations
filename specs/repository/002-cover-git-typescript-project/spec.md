---
id: REPO-002
domain: repository
product: Pi Integrations Workspace
status: approved
owner: Manuel Stolze
---

# Include Git integration in the root TypeScript project

## 1. Problem and intent

The root TypeScript project references four of the five workspace packages. It does not reference `packages/git-integration`. As a result, `npm run typecheck`, which runs `tsc -b`, does not include the Git package in the root project-reference build.

The workspace needs its root TypeScript project graph to include every current package so the root typecheck checks the Git integration too.

## 2. Scope

### In scope

- Add `packages/git-integration` to the root TypeScript project references.
- Verify that the root references cover all five current workspace packages.
- Confirm that the root typecheck includes the Git package.

### Out of scope

- Add an automated workspace-to-reference parity check.
- Change package TypeScript configuration, source code, tests, or runtime behavior.
- Change CI or release workflows.
- Repair unrelated dependency or type errors found during validation.

## 3. Requirements

- **FR-001:** The root TypeScript project MUST reference `packages/git-integration`.
- **FR-002:** The root TypeScript project MUST reference each of the five current workspace packages.
- **FR-003:** Running the root typecheck MUST include the Git package's TypeScript project.
- **FR-004:** The change MUST NOT add an automated parity check or change package behavior.

## 4. Capability deltas

- **Modified:** The root typecheck covers the Git integration as well as the other workspace packages.
- **None:** Package features, runtime behavior, and published package contents do not change.

## 5. Acceptance criteria

- `tsconfig.json` includes `packages/git-integration` in its project references.
- The root project references match all five current package directories under `packages/`.
- `npm run typecheck` checks the Git integration and passes with the repository's supported dependencies installed.
- No package source, package tests, package metadata, or runtime behavior changes.

## 6. Domain notes

The root npm workspace lists packages under `packages/*`. Each package has its own TypeScript project. The root `npm run typecheck` command runs `tsc -b`, which builds and checks the referenced TypeScript projects. The reference list is root build configuration, not package runtime behavior.

Follow `CONTRIBUTING.md` for validation. Do not change package boundaries or accepted architecture decisions for this repository configuration update.

## 7. Events and API contracts

- No extension command, event, public API, or package contract changes.
- No Changeset is required because this change affects only root workspace configuration.

## 8. Open questions

None. The owner selected a missing Git reference as the scope and declined an automated parity check.

## 9. Delivery notes

- **Branch:** `fix/repository-git-typescript-reference`
- **Commit subject:** `🏗️ build(repo): include Git in TypeScript project references`
- **Pull request title:** `🏗️ build(repo): include Git in TypeScript project references`
- **Pull request summary:** Add the Git package to the root TypeScript project so root typechecks include all five workspace packages.
