---
id: GIT-001
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
status: approved
owner: Manuel Stolze
---

# Tasks: Move Git integration to hexagonal architecture

- [x] **T01** — Move process execution into infrastructure. Move the process
  result and runner code to `src/infrastructure/process/`. Remove its direct
  `ExtensionAPI` dependency. Pass the `pi.exec` function from `src/index.ts`
  and preserve the current working directory, timeout, output trimming, and
  error handling. Update the affected process and adapter tests.
  **Acceptance gate:** process tests pass with a fake `exec` function; package
  build and typecheck pass; infrastructure imports no Pi API.

- [x] **T02** — Move Git and hosting code into infrastructure. Move the Git
  adapter to `src/infrastructure/git/` and the hosting adapters, registry, and
  contract to `src/infrastructure/hosting/`. Update imports in source and
  tests.
  **Acceptance gate:** Git and hosting adapter tests pass; package build
  passes; the adapters still use the application ports and keep current
  command and result behavior.

- [x] **T03** — Move the Pi interface and wire the package. Move the extension,
  mode parser, and rendering modules into `src/interface/pi/`. Update
  `src/index.ts` and test imports. Keep the default extension factory and
  supported package exports unchanged.
  **Acceptance gate:** interface and rendering tests pass; package build
  produces `dist/index.js`; `/herald`, `/herald commit`, and `/herald request`
  retain their current registration and behavior.

- [x] **T04** — Check layer boundaries and preserved behavior. Review source
  imports against the dependency rules in the plan. Run the package tests and
  add or adjust tests only where needed to cover domain, application,
  infrastructure, and interface responsibilities.
  **Acceptance gate:** package tests pass; domain and application code have no
  Pi or system API imports; application code has no concrete Git, provider,
  or process implementation imports; the old `src/adapters/` tree is gone.

- [x] **T05** — Add a patch changeset and run final checks. Add a changeset for
  `@manuelstolze/pi-git-integration`. Run `npm run typecheck`, `npm run build`,
  `npm test`, `npm run build --workspace @manuelstolze/pi-git-integration`,
  and `npm test -- --run packages/git-integration/test` from the repository
  root.
  **Acceptance gate:** all listed checks pass; the changeset names the Git
  integration package and uses a patch bump; no public API or user-visible
  behavior change is found.

## Delivery notes

- **Branch:** `refactor/001-hexagonal-architecture-migration`
- **Commit subject:** `♻️ refactor(git-integration): migrate to hexagonal architecture`
- **Pull request title:** `♻️ refactor(git-integration): migrate to hexagonal architecture`
- **Pull request summary:** Separate Git rules and workflows from Pi, Git, provider, and process code without changing Git integration behavior or its public API.
