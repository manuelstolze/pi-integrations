# Tasks: Align Permission Gate Workspace Name

- [ ] **T01** — Move `packages/permission-gate` to `packages/pi-permission-gate`. Update the root TypeScript project reference and the permission-gate link in `CONTEXT-MAP.md`. **Acceptance gate:** The package files exist under the new directory; the old directory is absent; active TypeScript and context-map paths point to the new directory.
- [ ] **T02** — Update package metadata and active repository references. Set `repository.directory` to `packages/pi-permission-gate`, keep the npm package name and `pi.extensions` entry unchanged, and update current documentation paths or labels where needed. Preserve historical paths that describe the repository at that time. **Acceptance gate:** A repository search finds no stale active path; any remaining old paths are historical and intentionally unchanged; package name and extension entry are unchanged.
- [ ] **T03** — Regenerate `package-lock.json` through npm and add a patch Changeset for `@manuelstolze/pi-permission-gate`. **Acceptance gate:** Lockfile workspace paths resolve to the new directory without unrelated changes; the Changeset specifies a patch release and keeps the published package name unchanged.
- [ ] **T04** — Validate the completed rename and inspect the final diff. Run `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` from the repository root. **Acceptance gate:** All four commands pass; the diff meets the spec and plan; no source behavior, public API, user configuration, or supported host versions changed.

## Delivery

- **Branch:** `refactor/align-permission-gate-package-path`
- **Commit subject:** `♻️ refactor(permission-gate): align package folder name`
- **Pull request title:** `♻️ refactor(permission-gate): align package folder name`
- **Pull request summary:** Rename the permission-gate workspace folder and update active references and package metadata without changing the published package name or extension behavior.
