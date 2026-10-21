# Implementation tasks: Require Pi 1.3.0 across all extensions

**Status:** Approved by the owner in the conversation, including the dependency-installation commands. All four implementation tasks are complete.

## 1. Approval and safety

Approval of this file authorizes the implementation below, including:

- `npm install --package-lock-only --ignore-scripts`, which updates `package-lock.json` after the manifest edits.
- `npm ci`, which replaces the repository's installed `node_modules` with the locked dependency tree.

These commands do not change the global Pi installation, personal settings, or credentials. Do not run `npm audit fix`, add dependency overrides, publish packages, commit, push, or force-push.

The repository was on `main` when implementation began. The owner approved creating `build/require-pi-1-3` from that branch. Keep this new dependency branch. Preserve the Herald implementation already in its committed history. Do not rewrite historical specifications, changelogs, or Pi 1.1.0 test results.

## 2. Ordered tasks

- [x] **T01** — Raise the declared minimum across the workspace.
  - **Files:** Root `package.json` and `packages/{git-integration,hello-world,jira-integration,pi-model-warning,pi-permission-gate}/package.json`.
  - Record the starting branch and working-tree state. Preserve all existing work.
  - Set the root and all five packages' development dependency on `@earendil-works/pi-coding-agent` to `^1.3.0`.
  - Set all five packages' corresponding peer dependency to `>=1.3.0 <2`. A peer dependency states the host-provided versions that an extension supports.
  - In model-warning and permission-gate, set the Pi TUI development dependency to `^1.3.0` and peer dependency to `>=1.3.0 <2`. Pi TUI supplies terminal interface components.
  - Keep package release versions, entry points, other dependency declarations, and the Node.js minimum unchanged.
  - **Acceptance gate:** A metadata check confirms every target value. The manifest diff contains only the approved Pi and Pi TUI range changes.

- [x] **T02** — Update the lockfile and install supported versions.
  - **Depends on:** T01.
  - **Files and area:** `package-lock.json` and local `node_modules`.
  - Run `npm install --package-lock-only --ignore-scripts` at the repository root.
  - Review the lockfile diff. Retain only changes required by the new Pi minimum and its dependency tree. Do not edit resolution records by hand.
  - Run `npm ci`. This replaces the installed dependency tree, as stated in section 1.
  - Run `npm ls @earendil-works/pi-coding-agent @earendil-works/pi-tui --all` and record the installed versions.
  - Prefer the verified 1.3.0 release. If npm selects a later supported 1.x release, report the actual version rather than claiming a 1.3.0 test run.
  - **Acceptance gate:** Clean installation succeeds. Manifest and lockfile declarations agree. Installed Pi and directly required Pi TUI versions are at least 1.3.0 and below 2.0.0. npm reports no invalid peer dependencies.

- [x] **T03** — Update current compatibility documentation and release notes.
  - **Depends on:** T02.
  - **Files:** `CONTEXT.md`, all five package `README.md` files, and a new `.changeset/<new-file>.md`.
  - State the shared Pi minimum of 1.3.0 in the repository context.
  - Update each package's compatibility section. State the matching Pi TUI minimum in model-warning and permission-gate.
  - Preserve Node.js requirements and Herald configuration instructions. Do not change historical changelogs or prior test evidence.
  - Add one Changeset covering all five packages with release level `minor`, as explicitly requested by the owner. The release-policy exception is recorded in `spec.md`. A Changeset records a future package release and its user-facing changes.
  - Explain that Pi 1.1.x and 1.2.x are no longer supported. Explain the new Pi TUI minimum for its two direct consumers. State that runtime behavior and the Node.js minimum are unchanged.
  - Preserve any existing Changesets. Do not run versioning or publication commands.
  - **Acceptance gate:** All current compatibility sections and the repository context match the manifests. The new Changeset covers exactly the five affected packages with minor release levels. No historical evidence or Herald instructions are overwritten.

- [x] **T04** — Record verified supporting facts for ADR-0008.
  - **Depends on:** T02 and T03.
  - **Files:** `docs/adr/0008-declare-pi-api-packages-as-peer-dependencies.md` and `docs/adr/README.md`.
  - Follow the accepted-record correction process in `docs/adr/README.md`. ADR means architecture decision record.
  - Append the owner-approved dated as-built note described in `plan.md`. Reference REPO-003 and link its specification.
  - State the verified Pi and Pi TUI ranges. Keep the accepted decision, rationale, alternatives, and previous notes unchanged.
  - Update `last_reviewed` and append a review-log row using the actual review date. Preserve all prior rows.
  - **Acceptance gate:** The new note agrees with the manifests. The accepted peer-dependency decision remains unchanged. Review metadata and the new log entry agree.

## 3. Delivery notes

- **Current branch:** `build/require-pi-1-3`, created from `main` with owner approval.
- **Commit subject:** `🏗️ build(deps): require Pi 1.3.0 across extensions`
- **Pull request title:** `🏗️ build(deps): require Pi 1.3.0 across extensions`
- **Pull request summary:** Raise Pi and directly declared Pi TUI minimums to 1.3.0, align development dependencies and the lockfile, and add minor-release notes that state the dropped host-version support without changing extension behavior.
- **Approval gate:** The owner approved this file and its installation commands. Commit, push, and publication still require a separate request.
