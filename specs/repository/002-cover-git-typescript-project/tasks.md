# Tasks: Include Git integration in the root TypeScript project

- [x] **T01** — Add `packages/git-integration` to the root `tsconfig.json` project references. Verify that the root references cover all five package directories under `packages/`. **Acceptance gate:** Every current workspace package has one root project reference, including Git; no automated parity check is added.
- [x] **T02** — Run `npm run typecheck` and `npm test`, then review the change. **Acceptance gate:** Report each command's result, confirm that the typecheck includes `packages/git-integration`, and confirm that no unapproved files changed. If existing local dependency problems block checks, report them without replacing dependencies.

## Delivery notes

- **Branch:** `fix/repository-git-typescript-reference`
- **Commit subject:** `🏗️ build(repo): include Git in TypeScript project references`
- **Pull request title:** `🏗️ build(repo): include Git in TypeScript project references`
- **Pull request summary:** Add the Git package to the root TypeScript project so root typechecks include all five workspace packages.
