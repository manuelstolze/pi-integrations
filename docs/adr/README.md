# Architecture Decision Records (ADR)

An ADR records one architecture decision. Create one file per decision from
[`0000-adr-template.md`](0000-adr-template.md). This file defines the ADR lifecycle and
index. The template defines the document structure.

## Create and accept an ADR

1. Check this index and use the next sequential number. Use the filename format
   `NNNN-short-title.md`, such as `0006-cache-user-settings.md`.
2. Start from the template. Add a row to the index with a link, title, and status.
3. Set the status to `proposed` while the decision is under review.
4. Set the status to `accepted` after the listed approver or approvers approve the decision.
   Record the approver in `approvers`.

The `status` field is required. For new ADRs, add `date` when created and list at least one
person in `approvers` before setting the status to `accepted`. Add `related` when the ADR has
related decisions. Add `last_reviewed` after a review. Add `amended_by` only when another
ADR amends this one. Existing ADRs may predate these metadata rules. Do not change their
status or guess missing historical values because metadata is absent.

## Lifecycle

Statuses use these exact values in ADR frontmatter and in the index:

- `proposed` — under review; may be edited freely.
- `accepted` — approved and in effect.
- `superseded by ADR-NNNN` — replaced by the named ADR.
- `deprecated` — no longer recommended, with no replacement recorded.

The index status must match the ADR's `status` field.

**Accepted decisions are immutable.** Do not rewrite an accepted ADR's decision, rationale,
or alternatives. To change a decision, create a new ADR and supersede the old one.

**Amendment** — a later ADR changes part of an accepted decision without replacing it. Keep
the original status as `accepted`. Add the amending ADR to the original ADR's `amended_by`
field. The amending ADR must link to the original in `related`. Do not rewrite either ADR's
decision text.

**Supersession** — the decision itself changes. Create a new ADR that links to the old one
in `related`. Change the old ADR's status to `superseded by ADR-NNNN`, using the new ADR's
number.

**Correcting facts** — if supporting text in an accepted ADR is factually wrong, leave the
text in place. Add an owner-approved, dated note that names the tracking ticket and explains
the mismatch. The owner is the approver or the current owner of the affected package or
system. Use this form:

```markdown
> **As-built note (YYYY-MM-DD, TICKET).** The decision is unchanged. <what no longer
> matches, and what the repository does instead.> The text is left as written.
```

Use **Amendment note** when the correction follows from another ADR. Use **As-built note**
when the correction follows from the code. Metadata fields such as `approvers`, `related`,
`last_reviewed`, and `amended_by` may be corrected directly when needed.

## Review process

A review checks an ADR against the current code, dependencies, and infrastructure. Review
an accepted ADR when its implementation first becomes available, and again when a material
change could make its decision or supporting facts invalid. This process has no fixed
calendar schedule.

Record the review date and verdict (`valid` or `outdated`) in the ADR's `last_reviewed`
field. Add a row to the review log. Keep past rows. If a mismatch is later fixed, append the
resolution to the original row; do not change its original date or verdict. Link a detailed
audit file when one exists. A review result is not a status and does not move the ADR through
its lifecycle.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-read-only-jira-access.md) | Start with read-only Jira access | `accepted` |
| [0002](0002-use-atlassian-cli-for-jira-access.md) | Use the Atlassian CLI for Jira access | `accepted` |
| [0003](0003-detect-git-hosting-provider-from-origin.md) | Detect the Git hosting provider from the origin remote | `accepted` |
| [0004](0004-use-one-review-request-flow-for-github-and-gitlab.md) | Use one review-request flow for GitHub and GitLab | `accepted` |
| [0005](0005-adopt-hexagonal-ddd-architecture.md) | Adopt Hexagonal + DDD Architecture | `accepted` |
| [0006](0006-use-a-layered-permission-gate-for-bash-commands.md) | Use a layered permission gate for Bash commands | `accepted` |
| [0007](0007-publish-extension-packages-independently-from-the-shared-workspace.md) | Publish extension packages independently from the shared workspace | `accepted` |
| [0008](0008-declare-pi-api-packages-as-peer-dependencies.md) | Declare Pi API packages as peer dependencies | `accepted` |
| [0009](0009-detect-github-enterprise-hosts-as-github.md) | Detect GitHub Enterprise hosts as GitHub | `proposed` |

## Review log

| Date | Scope | Result |
| --- | --- | --- |
| 2026-10-06 | ADR-0001 — `packages/jira-integration/src/index.ts`, `packages/jira-integration/src/jira-client.ts` | `valid` — the package exposes search, view, and comment-list operations. It has no Jira issue write operation. |
| 2026-10-06 | ADR-0002 — `packages/jira-integration/src/index.ts`, `packages/jira-integration/src/jira-client.ts` | `valid` — Jira access uses `acli` through the client runners. No direct Jira HTTP client is present. |
| 2026-10-06 | ADR-0003 — `packages/git-integration/src/domain/hosting-provider.ts`, `packages/git-integration/src/adapters/hosting/provider-registry.ts` | `outdated` — only `github.com` is classified as GitHub. All other hosts use the GitLab probe. The GitHub Enterprise Cloud coverage claim is broader than the code behavior. |
| 2026-10-06 | ADR-0004 — `packages/git-integration/src/adapters/pi/render-instructions.ts`, `packages/git-integration/src/adapters/pi/extension.ts` | `valid` — shared agent instructions define approval, target, duplicate-check, and failure rules. Provider commands vary by hosting service. |
| 2026-10-06 | ADR-0005 — `docs/hexagonal-packages.md`, `packages/git-integration/src/`, `packages/jira-integration/src/` | `outdated` — Git still groups outer layers under `adapters/`, as the docs record. Jira does not separate its domain, application, infrastructure, and interface code into layers. |
| 2026-10-07 | ADR-0006 — `packages/permission-gate/src/domain/permission-rules.ts`, `packages/permission-gate/src/application/use-cases/permission-gate.ts`, `packages/permission-gate/src/infrastructure/config/file-permission-config-adapter.ts`, `packages/permission-gate/src/interface/pi/extension.ts` | `valid` — fixed auto-deny rules run first; pattern matches require approval; approval failure blocks the command. |
| 2026-10-07 | ADR-0007 — `package.json`, `.changeset/config.json`, `.github/workflows/release.yml`, `CONTRIBUTING.md` | `valid` — the repository uses npm workspaces and Changesets to version and publish packages separately with shared release automation. |
| 2026-10-07 | ADR-0008 — `packages/hello-world/package.json`, `packages/git-integration/package.json`, `packages/jira-integration/package.json`, `packages/permission-gate/package.json`, `tsconfig.base.json` | `valid` — all packages list the Pi coding-agent package as both a peer and development dependency; the TypeScript build does not bundle package dependencies. |
| 2026-10-07 | ADR-0003 — `packages/git-integration/src/domain/hosting-provider.ts`, `packages/git-integration/src/adapters/hosting/provider-registry.ts` | `outdated` — `github.com` is the only host classified as GitHub; every other host uses the GitLab adapter. Custom GitHub Enterprise hosts are not identified as GitHub. |
| 2026-10-07 | ADR-0005 — `docs/hexagonal-packages.md`, `packages/git-integration/src/`, `packages/jira-integration/src/`, `specs/git-integration/001-hexagonal-architecture-migration/spec.md`, `specs/jira-integration/001-hexagonal-architecture-migration/spec.md` | `outdated` — Git still groups outer code under `adapters/`, and Jira still keeps its code in two source files. Draft migration specs exist for both packages. |
