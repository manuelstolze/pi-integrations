# @manuelstolze/pi-jira

A Pi package that provides read-only Jira tools and a Jira workflow skill.

## What it provides

The package registers three tools for the agent:

- `jira_search` searches issues with JQL.
- `jira_view` reads normalized details for one issue.
- `jira_comments` reads recent comments for one issue.

The package also includes the `jira-integration` skill. The skill explains when to use each tool and includes an `acli` fallback for sessions where the tools are not available.

Jira descriptions and comments are treated as untrusted data. The package does not create, edit, transition, comment on, or delete Jira issues.

## Installation

Install the package with Pi:

```bash
pi install npm:@manuelstolze/pi-jira
```

The package needs the Atlassian CLI (`acli`):

```bash
brew tap atlassian/homebrew-acli
brew install acli
```

Set the Jira environment variables:

```bash
export JIRA_URL="yoursite.atlassian.net"
export JIRA_EMAIL="you@yourcompany.com"
export JIRA_API_TOKEN="your-api-token"
```

The extension checks authentication when the first Jira tool runs. It uses the variables above to log in when needed. You can also authenticate manually:

```bash
echo "$JIRA_API_TOKEN" | acli jira auth login \
  --site "$JIRA_URL" --email "$JIRA_EMAIL" --token
```

You can set an optional project used by the skill when it builds JQL:

```bash
export JIRA_DEFAULT_PROJECT="ODP"
```

Generate an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>.

## Tool limits

- `jira_search` returns 10 issues by default and accepts at most 50.
- `jira_comments` returns 5 comments by default and accepts at most 20.
- Jira commands have a 30-second timeout.

## Skill command

The bundled skill is named `jira-integration` so it does not collide with a global skill named `jira`:

```text
/skill:jira-integration
```

Pi can also load the skill automatically when a request matches its description.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-jira
npm test -- --run packages/jira/test
npm run typecheck
```

The tests use fake command runners. They do not need Jira credentials or network access.
