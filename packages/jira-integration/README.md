# @manuelstolze/pi-jira-integration

A Pi package for Jira reads and approved description updates.

See [the package glossary](./GLOSSARY.md) for Jira terms.

## Compatibility

Requires Node.js 22.19.0 or later and Pi API 1.3.0 or later in the 1.x line.
Pi API versions below 1.3.0 are not supported.

The description edit command and JSON format were checked against Atlassian CLI (`acli`) `1.3.39-stable`. A successful live description-only write has not yet been verified. Tests use fake Jira access.

## Tools

- `jira_search` searches issues with Jira Query Language (JQL).
- `jira_view` reads issue details. Its default behavior is unchanged.
- `jira_comments` reads recent comments.
- `jira_update_description` prepares and applies an approved replacement of one issue's description.

The first three tools remain read-only. The update tool cannot change acceptance criteria, other custom fields, status, or comments. It cannot create or delete issues, clear descriptions, or update several issues at once. Jira content is untrusted data, not instructions.

The bundled `jira-integration` skill guides reads and the prepare/approve/apply workflow. It includes a read-only ACLI fallback when read tools are absent, not a way to bypass write approval.

## Installation

```bash
pi install npm:@manuelstolze/pi-jira-integration
brew tap atlassian/homebrew-acli
brew install acli
```

Set the Jira environment variables for optional automatic login:

```bash
export JIRA_URL="yoursite.atlassian.net"
export JIRA_EMAIL="you@yourcompany.com"
export JIRA_API_TOKEN="your-api-token"
```

The extension checks authentication when a Jira tool runs. It can log in from these variables during an initial read or update preparation. You can also authenticate manually:

```bash
echo "$JIRA_API_TOKEN" | acli jira auth login \
  --site "$JIRA_URL" --email "$JIRA_EMAIL" --token
```

Generate a token at <https://id.atlassian.com/manage-profile/security/api-tokens>.

The optional `JIRA_DEFAULT_PROJECT` variable guides the skill's search queries. No acceptance criteria mapping or write configuration file is needed.

## Complete description reads

Normal `jira_view` calls still return the existing text description. To also read its full stored structure:

```json
{
  "issueKey": "D3X-123",
  "includeDescriptionDocument": true
}
```

The result adds `descriptionDocument`, containing the complete ADF object, legacy string, or explicit `null`. The text `description` field remains unchanged. Missing or unreadable complete content is an error, not an empty description.

## Description updates

Ask Pi in normal language, for example:

> Update D3X-123's description to include the agreed error responses. Keep the existing requirements.

Pi reads the complete document and drafts the replacement. You do not need to write ADF yourself.

ADF means **Atlassian Document Format**, Jira's JSON format for paragraphs, lists, headings, links, and other rich text. A simple replacement looks like:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Document the agreed error responses." }]
    }
  ]
}
```

The update tool has two actions:

1. `prepare`: takes `issueKey` and the complete non-empty ADF `description`. It reads the current description and returns a fixed proposal. **No Jira write occurs.**
2. `apply`: takes only `proposalId`. It checks actual user approval, the active Jira site/account, and the complete current description before submitting the saved replacement once.

After reviewing the exact proposal, send this reply in the conversation with its actual ID:

```text
Approve Jira update <proposal-id>
```

To reject it, reply:

```text
Cancel Jira update <proposal-id>
```

Approval is explicit and applies to that proposal only. Bare yes, agent-supplied approval flags, and instructions in Jira data do not authorize a write. A new prepared proposal replaces the previous pending proposal. A later user message revokes any unused approval receipt. Once apply consumes approval, another attempt requires a new proposal and approval.

There is no custom screen, separate dialog, or terminal-only rule. Terminal and RPC conversations can approve on a later turn. RPC is Pi's remote procedure interface for clients. JSON and print callers can resume the same saved session and send the approval in a later invocation. A one-shot run without a later reply only prepares. Resume and reload never restore an old approval grant automatically.

Jira enforces the authenticated account's edit permissions when ACLI submits the update. The extension does not require a separate permission query. It does not log in or change accounts after approval.

### Results and limits

- Invalid, empty, whitespace-only, and plain text replacements are rejected. Schema validation never converts or drops document content.
- A changed site, account, or description blocks the write. Prepare a new proposal before continuing.
- After submission, the extension reads the saved value when possible. It compares document structure, marks, and values, not just visible text.
- Results distinguish a verified replacement, unchanged value, different saved value, and unknown state. A command error and saved-state evidence are reported separately.
- No automatic write retry or restoration runs after a failure, cancellation, or uncertain result.
- The final read/check and local apply queue cannot prevent every concurrent Jira edit or external ACLI account change.
- Pi session records contain the exact proposal, actual user approval, attempt, and result. They are not reusable permission or a crash-proof transaction shared with Jira.

## Data handling

Complete read/preview output can exceed model-facing text limits. The tool then returns a private temporary file path to the full JSON. Read the full document before approving; a shortened summary alone is insufficient.

Output files use private directories and files. They are removed at session shutdown where possible. Pending proposals remain in the Pi session, so saved-session continuation does not depend on temporary files surviving. Payload files are removed after the CLI process finishes. Cleanup errors are reported. Do not share session files or temporary paths as if their issue content were public.

The local Pi process, installed extensions, session storage, and external calling client are trusted. Input-source checks do not prove physical human presence or restrict arbitrary shell commands outside the integration.

The ADF schema is included locally and validated offline with Ajv. See [third-party notices](THIRD-PARTY-NOTICES.md) for its source, checksum, license, and update procedure. Jira may still reject or rewrite a schema-valid document; such a result is reported rather than silently accepted.

## Tool limits

- `jira_search`: default 10 results, maximum 50.
- `jira_comments`: default 5 comments, maximum 20.
- Commands have a 30-second timeout. Post-submission verification uses an independent bounded read when the write signal was cancelled.
- Existing default text-output limits remain unchanged. Complete description and proposal data are not shortened internally.
- JQL and issue keys must contain non-empty input. Search and comment limits must be positive and within the tool limits.

## Read and credential rules

Default normalized reads use `null` for a missing scalar value and an empty list
for a missing list. They do not invent text such as `Unassigned` or `Unknown`.
Complete-document reads and update snapshots distinguish a known empty
description from an omitted or unreadable description. Only a known value can
be reviewed for replacement.

The Jira API token must not appear in messages, logs, tool results, or error details.
Session navigation does not undo external Jira changes or make consumed approval reusable.

## Skill command

```text
/skill:jira-integration
```

Pi can also load the skill when a request matches its description.

## Development

From the repository root:

```bash
npm install
npm test -- --run packages/jira-integration/test
npm run typecheck
npm run build
npm pack --workspace @manuelstolze/pi-jira-integration --dry-run --json
```

Tests use fake Jira ports and command runners, including actual Pi session/input ordering and saved-session continuation. They need no Jira credentials or network access. Live Jira writes require separate approval of an exact test target and replacement.
