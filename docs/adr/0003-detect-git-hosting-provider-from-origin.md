---
status: accepted
---

# Detect the Git hosting provider from the origin remote

The Git integration detects the hosting provider from the repository's `origin`
remote before it runs the full commit, push, and review-request flow.

A `github.com` host selects GitHub. This also covers GitHub Enterprise Cloud.
For other hosts, the integration probes the GitLab CLI (`glab`) against the
current repository. This supports self-hosted GitLab without requiring a list of
host names in user configuration.

The integration requires a usable `origin` remote for request and full modes.
Commit-only mode does not need a hosting provider. If the provider cannot be
detected, or the required CLI is missing or not authenticated, the integration
stops before it creates commits or pushes changes.

This avoids guessing from arbitrary host names and prevents the wrong hosting
CLI from running against a repository.
