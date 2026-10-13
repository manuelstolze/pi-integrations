# Technical plan: Include Git integration in the root TypeScript project

## 1. Approach

Add the Git integration package path to the root `tsconfig.json` project references. Keep package TypeScript settings unchanged. Do not add a workspace-to-reference script or test.

Verify the reference list against the five package directories. Run the root typecheck to confirm that TypeScript includes the Git project. The existing local dependencies were reported as invalid during the earlier assessment, so any typecheck failure must be checked against that known environment issue. Do not replace dependencies as part of this change.

## 2. Affected areas

| Area | Planned change |
| --- | --- |
| Root `tsconfig.json` | Add `packages/git-integration` to the existing project references. |
| Root typecheck | Use `npm run typecheck` as the acceptance check. Confirm its TypeScript build graph includes the Git package. |
| Workspace package list | Compare the root references with the five current package directories. This is a one-time verification, not an added automated check. |

No package source, package tests, package context files, documentation, public contracts, or release files need updates.

## 3. Work sequence

1. Add the Git package path to the root TypeScript project references.
2. Compare the root references with the package directories under `packages/`.
3. Run `npm run typecheck` and confirm that the Git project is checked.
4. Review the diff to confirm that only the intended root configuration and approved planning artifacts changed.

## 4. Verification gates

Run from the repository root:

```bash
npm run typecheck
npm test
```

Also confirm that the root reference list contains all five current workspace packages. The typecheck must pass with the repository's supported dependencies installed and must include `packages/git-integration`. Run the test suite as a regression check; this configuration change does not alter test behavior.

If local dependency problems block these checks, report the exact failures. Do not run `npm ci` or replace the current dependency tree without discussing that action.

## 5. Risks and constraints

- Adding the missing reference can expose Git package type errors that the root typecheck did not previously check. Report such errors; do not expand the scope to fix them without owner approval.
- The assessment found invalid local Pi dependencies and a missing Pi TUI package. A failure caused by this existing environment does not establish that a clean supported install fails.
- Do not add generated build output to the change.

## 6. Delivery notes

- **Branch:** `fix/repository-git-typescript-reference`
- **Commit subject:** `🏗️ build(repo): include Git in TypeScript project references`
- **Pull request title:** `🏗️ build(repo): include Git in TypeScript project references`
- **Pull request summary:** Add the Git package to the root TypeScript project so root typechecks include all five workspace packages.
