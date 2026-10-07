---
status: proposed
date: 2026-10-07
related:
  - ADR-0003
---

# ADR 0009 — Detect GitHub Enterprise hosts as GitHub

## TL;DR

We propose to treat GitHub Enterprise as the existing `github` provider, not as a third provider. For custom remote hosts, the extension will check repository access with the GitHub CLI (`gh`) and GitLab CLI (`glab`), then use the provider whose check succeeds. It will stop if neither or both checks succeed.

## Context

ADR-0003 identifies `github.com` as GitHub and checks other hosts with `glab`. This supports GitHub.com and GitLab hosts, but it sends custom GitHub Enterprise hosts to the GitLab check. GitHub Enterprise uses the GitHub provider and adapter; its custom hostname needs a different detection step.

**Scope:** This ADR amends provider detection in ADR-0003. It covers `github.com`, custom GitHub Enterprise hosts, and GitLab hosts. It does not add a third provider type or change commit-only mode.

## Options in scope

1. **Check both provider CLIs** — For custom hosts, use `gh` and `glab` to check repository access. Use the provider whose check succeeds. Stop if neither or both succeed.
2. **Require host mappings** — Ask users to map each custom hostname to GitHub or GitLab in configuration.
3. **Maintain known host patterns** — Add known GitHub Enterprise hostnames to code and treat other hosts as GitLab.

### Comparison

| Criterion | Check both provider CLIs | Require host mappings | Maintain known host patterns |
| --- | --- | --- | --- |
| Custom-host coverage | ✅ Supports custom hosts without a fixed hostname list. | ✅ Supports hosts users have mapped. | ⚠️ Supports only host patterns in code. |
| Safe failure | ✅ Stops if zero or two provider checks succeed. | ⚠️ Depends on correct host mappings, then checks provider access. | ❌ An unknown GitHub host can be sent to the GitLab check. |
| CLI setup | ⚠️ Checks both tools for custom hosts; the selected provider's tool must work. | ✅ Checks only the mapped provider's tool. | ✅ Checks the tool selected by the host rule. |
| Maintenance effort | ✅ No host list or per-host mapping to maintain. | ⚠️ Users must maintain custom host mappings. | ❌ The project must maintain host patterns and keep them current. |

Legend: ✅ good · ⚠️ neutral / caveat · ❌ bad · ⚪ n/a

## Decision

We propose to keep the provider types as `github` and `gitlab`. `github.com` continues to select GitHub directly. For other hosts, the extension will check repository access with both `gh` and `glab`. If exactly one check succeeds, the extension will use that provider. If neither or both checks succeed, it will stop before creating commits or pushing changes. Commit-only mode will continue to skip provider detection.

## Consequences

- **Positive:** GitHub Enterprise hosts use the existing GitHub adapter. Users do not need to maintain a host list for custom GitHub or GitLab hosts. The extension does not guess when the checks are inconclusive.
- **Negative / trade-offs:** Detection for custom hosts depends on provider CLI access. If the relevant CLI is missing, unauthenticated, or cannot view the repository, the extension stops before the hosting workflow.
- **Follow-ups:** Update provider detection and tests to check both CLIs for custom hosts. Keep GitHub.com detection direct and keep commit-only mode independent of hosting access.

## Alternatives considered

- **Require host mappings** — Not chosen because users would need to maintain each custom hostname in configuration.
- **Maintain known host patterns** — Not chosen because self-hosted Enterprise Server hosts can use arbitrary names, and an incomplete list can select the wrong provider.
