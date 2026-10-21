---
id: REPO-003
domain: repository
services:
  - "@manuelstolze/pi-git-integration"
  - "@manuelstolze/pi-hello-world"
  - "@manuelstolze/pi-jira-integration"
  - "@manuelstolze/pi-model-warning"
  - "@manuelstolze/pi-permission-gate"
product: Pi Integrations Workspace
status: approved
owner: Manuel Stolze
---

# Require Pi 1.3.0 across all extensions

## 1. Problem and intent

The owner requested a minimum Pi version of 1.3.0 and confirmed that the change applies to all extensions, not only Herald.

All five extensions currently declare a Pi minimum of 1.1.0. The workspace and package development dependencies also start at 1.1.0. Published requirements, development dependencies, the lockfile, and compatibility documentation must agree on the new minimum.

Pi TUI supplies terminal interface components. The model-warning and permission-gate packages declare it separately. Their minimum must match the new Pi minimum.

## 2. Scope

### In scope

- Raise the supported Pi version for all five published extensions to 1.3.0 or later within major version 1.
- Raise the separately declared Pi TUI minimum to 1.3.0 in model-warning and permission-gate.
- Align root and package development dependencies with the new minimum.
- Keep the root lockfile consistent with the dependency declarations.
- Update current compatibility documentation and record the repository-wide minimum.
- Add minor-release notes for all affected published packages, as explicitly requested by the owner. Keep the dropped host-version support clear.
- Validate the extensions on a supported dependency tree.

### Out of scope

- Support Pi 2.x or change the Node.js minimum.
- Change extension commands, tools, prompts, settings, approval checks, or other runtime behavior.
- Refactor extension code or add features.
- Repair unrelated dependency vulnerabilities. Report remaining advisories separately.
- Rewrite historical changelogs, approved historical specifications, or earlier test results to claim that they used Pi 1.3.0.
- Discard or replace the existing uncommitted Herald implementation.
- Publish packages, commit, push, or create a pull request without a separate request.

## 3. Requirements

- **FR-001:** Each of the five extension packages MUST declare `@earendil-works/pi-coding-agent` as a peer dependency with range `>=1.3.0 <2`. A peer dependency states which host-supplied package versions an extension supports.
- **FR-002:** The root workspace and each extension's development dependency on `@earendil-works/pi-coding-agent` MUST start at version 1.3.0 and remain within major version 1.
- **FR-003:** Model-warning and permission-gate MUST declare `@earendil-works/pi-tui` as a peer dependency with range `>=1.3.0 <2`. Their corresponding development dependencies MUST start at 1.3.0 and remain within major version 1.
- **FR-004:** Dependency declarations and the root lockfile MUST agree. A clean installation from the lockfile MUST succeed and resolve Pi and the directly required Pi TUI packages to supported versions.
- **FR-005:** All five package READMEs MUST state the new Pi minimum. Model-warning and permission-gate MUST also state the new Pi TUI minimum. The Node.js minimum MUST remain unchanged.
- **FR-006:** The repository context MUST record the shared minimum. Pi API packages MUST remain host-supplied peer dependencies and local development dependencies, as required by ADR-0008. This version change MUST NOT turn them into bundled runtime dependencies.
- **FR-007:** All existing extension behavior, including the current Herald model settings, MUST remain unchanged. Required builds, type checks, and tests MUST pass against the supported dependency tree, or failures MUST be reported accurately rather than treated as success.
- **FR-008:** Each affected published package MUST have a Changeset with release level `minor`, as explicitly approved by the owner. A Changeset records the package release level and user-facing change. The note MUST state that Pi versions below 1.3.0 are no longer supported. The two Pi TUI consumers MUST also state their new Pi TUI minimum.
- **FR-009:** Historical compatibility statements and test results MUST remain identifiable as historical evidence. Current documentation MUST NOT imply that Pi 1.1.x or 1.2.x remains supported.
- **FR-010:** Dependency work MUST stay limited to establishing the new minimum and a consistent installation. Any unrelated audit findings MUST be reported separately without an automatic broad dependency fix.

## 4. Capability deltas

- **Modified:** All five extensions require Pi `>=1.3.0 <2`, replacing `>=1.1.0 <2`.
- **Modified:** Model-warning and permission-gate require Pi TUI `>=1.3.0 <2`, replacing `>=1.1.0 <2`.
- **Removed:** Support for Pi 1.1.x and 1.2.x. The two direct Pi TUI consumers also drop Pi TUI 1.1.x and 1.2.x support.
- **None:** Extension runtime behavior, package boundaries, and the Node.js minimum do not change.

## 5. Acceptance criteria

1. All five package manifests declare Pi peer range `>=1.3.0 <2`.
2. The root and all five packages declare Pi development dependencies starting at 1.3.0 within major version 1.
3. Model-warning and permission-gate declare matching Pi TUI peer and development dependency minimums of 1.3.0.
4. The lockfile matches the manifests, and a clean installation succeeds with supported versions.
5. All package compatibility sections state Pi 1.3.0 as the minimum. The two direct Pi TUI consumers also state Pi TUI 1.3.0 as the minimum. Node.js requirements remain unchanged.
6. Repository documentation records the shared minimum without changing ADR-0008's peer-dependency decision or rewriting historical evidence.
7. Package builds, repository type checks, and the full test suite pass on the supported installation. This includes Herald's controlled Pi-host tests.
8. All five affected packages have minor-release Changeset coverage that states the dropped host-version support. No package is published as part of this task.
9. Existing Herald changes remain intact. No unrelated configuration, credentials, generated output, or feature change enters the diff.
10. Remaining audit findings and unrun checks are reported separately.

## 6. Domain notes

Follow `CONTEXT-MAP.md`, the repository context, and the five package context files.

Preserve ADR-0008: Pi API packages remain peer and development dependencies. Only the declared supported version range changes. Handle any updated as-built documentation under the process in `docs/adr/README.md`; do not replace the accepted decision.

A raised host minimum removes compatibility with older hosts even when extension commands and runtime behavior are unchanged. The owner explicitly requested a minor release for this change instead of the originally planned major release. This is an owner-approved release-policy exception. Release notes must still make the dropped version support explicit.

## 7. Public contracts

- Consumers must supply Pi 1.3.0 or later within major version 1.
- Model-warning and permission-gate consumers must also supply Pi TUI 1.3.0 or later within major version 1.
- Existing extension commands, tools, events, and settings retain their current meanings.
- No Node.js minimum or package installation method changes.

## 8. Open questions

None for the requested scope. The owner confirmed all extensions. Approval of this specification also confirms the aligned Pi TUI minimum described above.

## 9. Delivery notes

- **Suggested standalone branch:** `build/require-pi-1-3`
- **Current work:** Preserve `feat/configure-herald-model` and its uncommitted changes. The plan must state how this follow-up is delivered without discarding them.
- **Commit subject:** `🏗️ build(deps): require Pi 1.3.0 across extensions`
- **Pull request title:** `🏗️ build(deps): require Pi 1.3.0 across extensions`
- **Pull request summary:** Raise Pi and directly declared Pi TUI minimums to 1.3.0, align development dependencies and the lockfile, and add minor-release notes that state the dropped host-version support without changing extension behavior.
- **Approval gate:** Obtain approval of this specification, the technical plan, and implementation tasks before changing dependency declarations or runtime code.
