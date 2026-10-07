---
id: GIT-001
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
status: approved
owner: Manuel Stolze
---

# Technical plan: Move Git integration to hexagonal architecture

## 1. Approach

Keep the change inside `packages/git-integration`. Move code from the shared
`src/adapters/` tree into `src/infrastructure/` and `src/interface/pi/`. Keep
the existing `src/domain/` and `src/application/` responsibilities. Update
imports and tests to match the new paths.

Keep `src/index.ts` as the composition root. It will connect the Pi interface,
Git and hosting adapters, and process execution. Keep its default extension
factory as the only public extension entry point.

The process runner currently uses `ExtensionAPI.exec`. Move the process
contract and result normalization to `src/infrastructure/process/`. Pass the
Pi `exec` function into that infrastructure component from `src/index.ts`.
This keeps Pi API imports out of infrastructure while preserving the current
working directory, timeout, trimmed output, and error-to-result behavior. Do
not add a generic process port to the application layer.

## 2. Source layout changes

Move these files without changing their responsibilities:

| Current path | Planned path |
| --- | --- |
| `src/adapters/git/git-cli-adapter.ts` | `src/infrastructure/git/git-cli-adapter.ts` |
| `src/adapters/hosting/github-adapter.ts` | `src/infrastructure/hosting/github-adapter.ts` |
| `src/adapters/hosting/gitlab-adapter.ts` | `src/infrastructure/hosting/gitlab-adapter.ts` |
| `src/adapters/hosting/hosting-adapter.ts` | `src/infrastructure/hosting/hosting-adapter.ts` |
| `src/adapters/hosting/provider-registry.ts` | `src/infrastructure/hosting/provider-registry.ts` |
| `src/adapters/process/process-runner.ts` | `src/infrastructure/process/process-runner.ts` |
| `src/adapters/pi/extension.ts` | `src/interface/pi/extension.ts` |
| `src/adapters/pi/mode-parser.ts` | `src/interface/pi/mode-parser.ts` |
| `src/adapters/pi/render-instructions.ts` | `src/interface/pi/render-instructions.ts` |
| `src/adapters/pi/render-task.ts` | `src/interface/pi/render-task.ts` |

Update `src/index.ts` and all affected relative imports. Remove the old
`src/adapters/` tree when it is empty. Keep domain and application modules in
their current paths unless import updates require no more than path changes.
Do not add new public exports for internal modules.

## 3. Test changes

Keep tests inside `packages/git-integration/test/`. Update imports and group
the tests by the behavior they check:

- Domain tests check provider hints and target-branch rules without fakes or
  outside services.
- Application tests continue to use fake Git and hosting ports. They check
  the workflow decisions and prepared results.
- Infrastructure tests check Git and hosting command construction, provider
  selection, result mapping, and process timeout and error handling. Use a fake
  `exec` function for process tests; do not run real Git or hosting commands.
- Interface tests check Pi command registration, mode parsing, prompts, event
  handling, and rendered output using fake Pi APIs and fake application ports.

Keep the existing behavior checks for `/herald`, `/herald commit`, and
`/herald request`, provider selection, access checks, duplicate request
prevention, confirmations, and repository rules. Add or adjust tests only as
needed to verify the layer boundaries and unchanged behavior.

## 4. Contracts and documentation

- Keep `packages/git-integration/package.json`, `src/index.ts`'s default
  extension factory, the compiled entry point, and the supported package API
  unchanged.
- Keep command names, mode arguments, prompts, and user-facing results
  unchanged.
- Keep `packages/git-integration/CONTEXT.md` and the package README unchanged;
  the migration changes structure, not domain behavior or package usage.
- The architecture rules are already documented in
  `docs/hexagonal-packages.md` and ADR 0005. Do not edit those documents.
- Add a patch changeset for `@manuelstolze/pi-git-integration`, because the
  published package build changes even though its supported API and behavior
  stay the same.

## 5. Dependency rules

Review imports after moving files and keep these rules:

- `domain/` imports no application, Pi, Node.js, Git, or provider code.
- `application/` imports domain code and its capability-specific ports only.
  It does not import Pi, process execution, Git CLI, or provider
  implementations.
- `infrastructure/` implements Git and hosting behavior and contains process
  result handling. It does not import Pi APIs.
- `interface/pi/` contains Pi command, event, prompt, and output handling. It
  calls application workflows and supplies their required ports.
- `src/index.ts` wires the outside components together. It does not add new
  workflow policy.

## 6. Validation gates

Run these commands from the repository root:

1. `npm run typecheck`
2. `npm run build`
3. `npm test`
4. `npm run build --workspace @manuelstolze/pi-git-integration`
5. `npm test -- --run packages/git-integration/test`

Also review the source imports to confirm the dependency rules above. Confirm
that the package still builds `dist/index.js` and that the default extension
factory and `/herald` commands remain available. Report any failing check and
explain whether it is caused by this change.

## 7. Delivery notes

- **Branch:** `refactor/001-hexagonal-architecture-migration`
- **Commit subject:** `♻️ refactor(git-integration): migrate to hexagonal architecture`
- **Pull request title:** `♻️ refactor(git-integration): migrate to hexagonal architecture`
- **Pull request summary:** Separate Git rules and workflows from Pi, Git, provider, and process code without changing Git integration behavior or its public API.
