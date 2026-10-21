# Technical plan: Require Pi 1.3.0 across all extensions

**Status:** Approved by the owner in the conversation. The owner also approved `spec.md`. Implementation still requires approval of `tasks.md` and its dependency-installation steps.

## 1. Approach

Change only dependency declarations, the root lockfile, current compatibility documentation, and release notes. Do not change extension source or tests unless a supported-version failure demonstrates a need. If such a failure requires changed runtime behavior, stop and ask before expanding this specification.

Keep all Pi API packages as peer and development dependencies. A peer dependency states the versions supplied by the host that an extension supports. Do not add these packages as regular runtime dependencies or bundle them.

Use these declaration values:

| Location | Dependency | Value |
| --- | --- | --- |
| Root development dependencies | `@earendil-works/pi-coding-agent` | `^1.3.0` |
| All five package peer dependencies | `@earendil-works/pi-coding-agent` | `>=1.3.0 <2` |
| All five package development dependencies | `@earendil-works/pi-coding-agent` | `^1.3.0` |
| Model-warning and permission-gate peer dependencies | `@earendil-works/pi-tui` | `>=1.3.0 <2` |
| Model-warning and permission-gate development dependencies | `@earendil-works/pi-tui` | `^1.3.0` |

The development range `^1.3.0` permits version 1.3.0 and later 1.x versions, but not 2.x. Keep unrelated direct dependency declarations and the Node.js minimum unchanged.

Planning confirmed that both Pi 1.3.0 and Pi TUI 1.3.0 exist in npm. Both require Node.js `>=22.19.0`, matching the current repository requirement. The current local installation is Pi 1.1.0 and must be replaced for supported-version validation.

## 2. Affected files

### Dependency declarations

Update the root `package.json` and these five package manifests:

- `packages/git-integration/package.json`
- `packages/hello-world/package.json`
- `packages/jira-integration/package.json`
- `packages/pi-model-warning/package.json`
- `packages/pi-permission-gate/package.json`

Regenerate `package-lock.json` through npm. Do not edit dependency resolution records by hand. Preserve package names, extension entry points, current package versions, unrelated dependencies, and the existing workspace layout.

### Documentation

Update the compatibility sections in:

- `packages/git-integration/README.md`
- `packages/hello-world/README.md`
- `packages/jira-integration/README.md`
- `packages/pi-model-warning/README.md`
- `packages/pi-permission-gate/README.md`

Record the repository-wide Pi minimum in `CONTEXT.md`. State the Pi TUI minimum for packages that declare it directly. The package-specific context files do not currently state a numerical minimum; do not duplicate the new rule in every context file.

Preserve all Herald settings documentation added by GIT-004. Do not rewrite historical package changelogs or prior specifications and test results.

### ADR-0008 supporting facts

ADR means architecture decision record. ADR-0008 requires host API packages to remain peer and development dependencies. This decision does not change.

Follow `docs/adr/README.md`:

- Keep the accepted decision, rationale, alternatives, and existing notes unchanged.
- Append an owner-approved, dated as-built note to `docs/adr/0008-declare-pi-api-packages-as-peer-dependencies.md` after implementation confirms the new ranges.
- Use REPO-003 and its specification path as the tracking reference. State that all five packages now require Pi `>=1.3.0 <2`, and the two direct Pi TUI consumers require the same Pi TUI range.
- Update `last_reviewed` and append a review-log row in `docs/adr/README.md`. Use the actual implementation review date. Preserve all earlier rows.

Approval of this plan approves the supporting-fact correction described above. No new architecture decision or supersession is needed.

### Release note

Add one new file, `.changeset/<new-file>.md`, with all five package names marked `minor`.

The owner explicitly requested a minor release instead of the originally planned major release. Record this release-policy exception in `spec.md`. The raised host minimum still removes older host support. The release note must state:

- Pi 1.3.0 or later in the 1.x line is required.
- Pi 1.1.x and 1.2.x are no longer supported.
- Model-warning and permission-gate also require Pi TUI 1.3.0 or later in the 1.x line.
- The Node.js minimum and extension behavior are unchanged.

Do not run `version-packages`, rewrite package changelogs, or publish. Preserve the existing Herald Changeset and first-commit Changeset; release automation will combine pending changes for each package.

## 3. Dependency update procedure

After approval of this plan and `tasks.md`:

1. Capture the current working-tree state so the existing Herald work remains identifiable.
2. Update only the dependency fields listed in section 1.
3. Run `npm install --package-lock-only --ignore-scripts` from the repository root.
4. Review the lockfile diff. Accept only changes needed for the raised Pi minimum and its required dependencies. Do not run a broad update or `npm audit fix`.
5. Run `npm ci` to validate the regenerated lockfile and install the selected supported tree.
6. Verify the actual installed versions and dependency relationships with `npm ls @earendil-works/pi-coding-agent @earendil-works/pi-tui --all`.

`npm ci` replaces `node_modules`. The implementation tasks must clearly state this effect and request approval of these installation steps before execution. No global Pi installation, personal settings, or credentials are changed.

Prefer a lockfile that selects the verified Pi 1.3.0 release and matching Pi TUI release. If npm selects a later compatible 1.x version, report the exact selected version. Do not claim that tests ran on 1.3.0 unless they did. Do not add overrides or edit the lockfile by hand to force a result.

Required indirect dependency changes can follow Pi's published dependencies. Unrelated dependency fixes remain out of scope. Record remaining audit findings separately.

## 4. Verification strategy

### Metadata checks

Check every root and package dependency field against the table in section 1. Verify both direct Pi TUI consumers. Confirm that no affected package still advertises Pi or Pi TUI `>=1.1.0 <2` as its current supported range.

Check the lockfile's root and workspace declarations against the manifests. Verify that the installed Pi and directly required Pi TUI versions are at least 1.3.0 and below 2.0.0. Confirm there are no invalid peer dependencies.

Confirm that all five compatibility sections and `CONTEXT.md` state the new minimum. A search may still find 1.1.0 in historical changelogs, prior specifications, ADR notes, and package release versions. Do not treat those historical references as stale current requirements.

Verify that the new Changeset covers all five package names with a minor release. Do not change package release versions during this task.

### Runtime checks

Run the existing full test suite, including `packages/git-integration/test/supported-host.test.ts`, against the installed supported Pi tree. Those host tests use controlled local responses and do not need paid model access.

Run repository type checks and all workspace builds. Do not change tests to hide an incompatibility. If a version update reveals a real failure, report it and determine whether an additional approved change is needed.

No manual remote-model request, real Git workflow, Jira write action, or external-service authentication is required.

### Commands

Run from the repository root:

```bash
npm ls @earendil-works/pi-coding-agent @earendil-works/pi-tui --all
npm test -- packages/git-integration/test/supported-host.test.ts
npm run typecheck
npm run build
npm test
npm audit --json
git diff --check
```

The audit command can exit unsuccessfully because vulnerabilities remain. Report that result separately; this task does not promise an audit with no findings.

Acceptance gates:

- All version declarations, current documentation, and lockfile records agree.
- A clean `npm ci` succeeds with supported Pi and Pi TUI versions.
- Type checks, all workspace builds, the host tests, and the full test suite pass, or a blocking failure is reported without hiding it.
- The five-package minor Changeset is present.
- ADR-0008's accepted decision remains unchanged; only dated supporting facts and review metadata are added.
- The existing Herald implementation and its historical verification evidence remain intact.
- No personal configuration, credentials, generated output, package publication, or unrelated dependency fix enters the change.

## 5. Work sequence

1. Record approval of the specification, plan, and tasks.
2. Confirm approval for the documented lockfile and installation commands.
3. Update declarations and regenerate the lockfile.
4. Update compatibility documentation, the shared context rule, and the minor Changeset.
5. Install and verify the supported dependency tree.
6. Run metadata checks, type checks, builds, host tests, and all tests.
7. Add the ADR as-built note and review entry using verified facts.
8. Review the final diff and record exact validation results in `tasks.md`.

## 6. Delivery and existing work

The owner requested a rebase onto `origin/main` after this plan was drafted. The rebase completed without conflicts. At implementation start, the working tree was on `main`. The owner then approved creating `build/require-pi-1-3` from that branch for this dependency update. The Herald implementation is already in its committed history. Preserve it when editing compatibility documentation. Do not reset, stash, delete, commit, or push work as part of this dependency follow-up.

The new REPO-003 specification files track this dependency follow-up separately from GIT-004. This keeps the previously completed Pi 1.1.0 checks identifiable as historical evidence. Record the new test results separately after the update.

The dependency update now has its own branch, as approved by the owner. No work was discarded when creating it.

- **Current branch:** `build/require-pi-1-3`
- **Commit subject:** `🏗️ build(deps): require Pi 1.3.0 across extensions`
- **Pull request title:** `🏗️ build(deps): require Pi 1.3.0 across extensions`
- **Pull request summary:** Raise Pi and directly declared Pi TUI minimums to 1.3.0, align development dependencies and the lockfile, and add minor-release notes that state the dropped host-version support without changing extension behavior.
- **Approval gate:** The owner approved this plan. Obtain approval of `tasks.md` and its dependency-installation steps before changing manifests, the lockfile, or the installed dependency tree.
