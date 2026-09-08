---
status: accepted
---

# Use the Atlassian CLI for Jira access

The Jira integration uses the Atlassian CLI (`acli`) as its access boundary instead of calling the Jira HTTP API directly. This reuses the CLI's Jira authentication flow and keeps command execution behind one adapter, at the cost of requiring `acli` on the user's system.
