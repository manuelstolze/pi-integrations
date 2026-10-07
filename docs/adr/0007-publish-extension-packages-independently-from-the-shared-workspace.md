---
status: accepted
date: 2026-10-07
approvers:
  - Manuel Stolze
last_reviewed: "2026-10-07 — valid"
---

# ADR 0007 — Publish extension packages independently from the shared workspace

## TL;DR

We will keep extension packages in one npm workspace and version and publish each package independently. This shares development and release tools while allowing users and maintainers to select and release packages separately.

## Context

The repository contains several Pi extensions. They share build, test, and release tools, but each extension is an npm package with its own name and version. Users may need only some extensions, and a change to one extension should not require publishing every other extension.

**Scope:** This decision covers repository layout and package versioning and publishing. It does not require every extension to be released together or prevent packages from sharing development tools.

## Options in scope

1. **Shared workspace with independent packages** — Keep extension packages in one repository and publish each as its own npm package.
2. **One combined package** — Publish all extensions as one npm package with one version and release.
3. **Separate repositories** — Keep each extension in its own repository and release it separately.

### Comparison

| Criterion | Shared workspace with independent packages | One combined package | Separate repositories |
| --- | --- | --- | --- |
| Release autonomy | ✅ Each package can be versioned and released separately. | ❌ All extensions share one release version. | ✅ Each extension can be released separately. |
| Shared tooling | ✅ Packages share workspace tools and checks. | ✅ Packages share tools in one repository. | ❌ Tooling and checks must be coordinated across repositories. |
| Consumer choice | ✅ Users can install the packages they need. | ❌ Users install the combined package. | ✅ Users can install individual packages. |
| Repository overhead | ✅ One repository holds shared code and workflows. | ✅ One repository holds all extensions. | ❌ Multiple repositories need separate setup and coordination. |

Legend: ✅ good · ⚠️ neutral / caveat · ❌ bad · ⚪ n/a

## Decision

We will keep extension packages under `packages/*` in one npm workspace. Each package will keep its own npm name and version and can be published independently. The root repository will provide shared development checks and release automation. Package changes will use Changesets to describe version updates and drive publication.

## Consequences

- **Positive:** Packages share repository tools and checks. Users can install only the packages they need. A package can release without publishing unrelated packages.
- **Negative / trade-offs:** The root workspace and lockfile must stay in sync with package changes. Shared tooling changes can affect several packages.
- **Follow-ups:** Keep package publishing and versioning rules documented in `CONTRIBUTING.md` and the Changesets configuration.

## Alternatives considered

- **One combined package** — Not chosen because it couples package versions and requires users to install unrelated extensions.
- **Separate repositories** — Not chosen because each extension would need its own repository setup and duplicated release checks.
