---
status: accepted
---

# Use one review-request flow for GitHub and GitLab

The Git integration uses one `/herald` request flow for GitHub pull requests
and GitLab merge requests. It shares the review title, Markdown description,
approval gates, push behavior, and duplicate-request check. Provider-specific
CLI commands and target-branch rules remain behind the shared flow.

The flow follows `CONTRIBUTING.md` before its fallback rules. For GitLab, it
uses `develop`, then `main`, then `master` when no repository rule defines a
target. For GitHub, it uses the repository default branch. An existing open
request for the same source and target branches is reused instead of creating
a duplicate.

After a failed push or review-request creation, the integration stops and keeps
all local commits and remote branches. It does not reset commits or delete
branches automatically. GitLab requests keep the existing source-branch
removal option. GitHub requests do not delete the source branch because
`gh pr create` has no equivalent operation and branch deletion depends on
repository settings.

A shared flow keeps approval and failure behavior consistent while limiting
provider-specific behavior to provider integration boundaries.
