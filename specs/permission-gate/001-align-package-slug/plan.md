# Plan: Align Permission Gate Workspace Name

## Summary

Rename the workspace directory from `packages/permission-gate` to
`packages/pi-permission-gate`. Keep the npm package name, extension behavior,
public API, configuration, and supported host versions unchanged.

## Affected areas

| Area | Planned change |
| --- | --- |
| `packages/permission-gate/` | Move the package directory to `packages/pi-permission-gate/`. Keep package source, tests, README, context, and changelog content unchanged unless a current package-facing label or link needs the new directory name. |
| `package-lock.json` | Regenerate the workspace path records from the root after the move. Do not hand-edit generated lockfile data. |
| `tsconfig.json` | Point the project reference to `packages/pi-permission-gate`. |
| `packages/pi-permission-gate/package.json` | Keep `name` and `pi.extensions` unchanged. Set `repository.directory` to `packages/pi-permission-gate`. |
| `CONTEXT-MAP.md` | Update the package context link to the new directory. |
| Current documentation and workspace references | Update active paths and package-facing labels where required. Leave historical specifications, changelogs, and records unchanged when they describe the repository at that time. |
| `.changeset/` | Add a patch Changeset for `@manuelstolze/pi-permission-gate` that describes the repository directory metadata update. |

No source module, public contract, dependency, or runtime behavior changes are planned. The package context and ADR decisions do not change. Do not modify ADR records only to replace historically correct paths.

## Implementation approach

1. Move the package directory with a version-control-aware rename.
2. Search the repository for references to `packages/permission-gate` and classify each result as active or historical.
3. Update active workspace paths and current documentation links. Keep historical records intact as required by the spec.
4. Update `repository.directory` in the moved package manifest and add the patch Changeset.
5. Regenerate the root lockfile through npm and inspect the diff for unrelated changes.

## Verification

Run these checks from the repository root:

- `npm ci` — confirm the renamed workspace installs from the lockfile.
- `npm run typecheck` — confirm the TypeScript project reference resolves.
- `npm run build` — confirm all workspaces build.
- `npm test` — confirm package and repository tests pass.

Also inspect the final diff to confirm:

- The directory exists only at `packages/pi-permission-gate`.
- The package name and extension entry point are unchanged.
- Active workspace references use the new directory.
- Historical paths remain unchanged where they record past repository state.
- The Changeset is a patch release and names the existing npm package.

## Delivery

- **Branch:** `refactor/align-permission-gate-package-path`
- **Commit subject:** `♻️ refactor(permission-gate): align package folder name`
- **Pull request title:** `♻️ refactor(permission-gate): align package folder name`
- **Pull request summary:** Rename the permission-gate workspace folder and update active references and package metadata without changing the published package name or extension behavior.
