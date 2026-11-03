# JIRA-002 — CLI and host evidence

This file records checks completed during planning. It is not approval for another live Jira write.

## ACLI commands and format

The installed `acli` reports version `1.3.39-stable`.

The local edit help documents ADF descriptions, `--from-json`, `--yes`, and `--json`. The output of `acli jira workitem edit --generate-json` contains these top-level keys:

```text
assignee, description, issues, labelsToAdd, labelsToRemove, summary, type
```

Its description example is an ADF version 1 document. `issues` is an array of issue keys. The example does not include `additionalAttributes`.

The following commands were inspected without changing Jira:

- `acli --version`
- `acli --help`
- `acli jira --help`
- `acli jira workitem --help`
- `acli jira workitem edit --help`
- `acli jira workitem edit --generate-json`, in an isolated temporary directory; it printed JSON and created no file
- `acli jira workitem view --help`
- `acli jira workitem create --help`
- `acli jira field --help`
- `acli jira project --help`
- `acli config --help`
- `acli jira auth status --help`

The official [edit reference](https://developer.atlassian.com/cloud/acli/reference/commands/jira-workitem-edit/) and [CLI changelog](https://developer.atlassian.com/cloud/acli/changelog/) were fetched. They did not establish a custom-field edit format, clearing, or a separate per-issue permission query. Web search attempts returned no usable results; fetching the linked official pages succeeded.

## Read-only issue checks

The owner supplied D3X-25630 for investigation. The normalized `jira_view` tool read succeeded. A raw ACLI read was needed because the tool does not expose complete structured descriptions or custom fields.

`acli jira auth status` confirmed `techem-agile.atlassian.net` as the active site. `acli jira workitem view D3X-25630 --json --fields '*all'` showed:

- A D3X Story, type ID `10004`.
- A non-empty ADF version 1 description.
- A non-empty ADF version 1 document in `customfield_10258`, with eight list items.
- Headings, text formatting, lists, and document structure in the raw JSON.
- `null` values for `names`, `schema`, `editmeta`, and `operations`. Their names in the `expand` string do not establish that metadata was returned.

The issue contains real work content. It must not be treated as disposable.

## Approved combined-field experiment

The owner approved one experiment that would preserve both documents and append this paragraph to each:

```text
ACLI integration test — temporary marker for D3X-25630.
```

The experiment stored private original and expected field documents outside the repository. It checked the reviewed update timestamp and re-read both selected values immediately before attempting the edit. Neither selected value had changed.

One command ran:

```text
acli jira workitem edit --from-json <private-payload-file> --yes --json
```

The payload contained one issue key in `issues`, the approved description document in `description`, and the approved acceptance criteria document in `additionalAttributes.customfield_10258`. The custom-field format was an explicit experiment based on separate creation guidance, not a documented edit contract.

The command exited with code 1:

```text
json: unknown field "additionalAttributes"
```

Read-back confirmed that both selected documents exactly matched their original JSON values. Neither contained the marker. No retry or restoration ran. No cleanup was needed.

This rejects that custom-field format in the installed CLI. It does not prove that every possible custom-field update is unsupported. It also does not verify a successful description write. The owner later deferred acceptance criteria updates, clearing, and a separate pre-write permission query from this version.

## Pi compatibility checks

The repository's installed Pi coding-agent and Pi TUI packages both report version `1.3.0`, the package's minimum supported version.

Their declarations expose `ctx.mode`, `ctx.hasUI`, `ctx.ui.custom()`, `ctx.ui.confirm()`, `pi.appendEntry()`, `ScrollView`, `Text`, and terminal width helpers. The installed extension and terminal UI guides were read, along with the permission gate and Q&A examples. The repository permission approval adapter was also inspected.

These were checks for the earlier screen-based proposal. The owner later removed the custom review screen and terminal-only rule; the current plan does not require Pi TUI imports.

### Conversation approval source checks

The installed extension, session-format, message-types, and SDK guides were read. The input-transform and todo examples were inspected for input sources and branch-relative session state.

The repository's Pi `1.3.0` implementation was also inspected:

- `dist/core/extensions/types.d.ts` declares `InputSource` as `interactive`, `rpc`, or `extension`.
- `dist/core/agent-session.js` runs the input handlers before skill/template expansion. Ordinary prompts default to `interactive`; extension-injected prompts use `extension`.
- `dist/modes/print-mode.js` submits print and JSON prompts through `session.prompt()`. It can continue the same saved session in a later invocation; it does not offer a blocking confirmation UI.
- `dist/modes/rpc/rpc-mode.js` supplies `rpc` as the source for external prompt, steer, and follow-up input.
- `dist/core/extensions/runner.js` passes the source to input handlers. Input transformations can change text or consume input, so an input receipt alone does not establish that the same approval message was persisted.
- The session API exposes active-branch and all-entry reads. The message format distinguishes stored user messages from tool results and custom messages, but a user-role message alone does not prove that it came from external user input.

These source checks support a prepare/approve/apply design with a trusted input receipt plus a matching user message after the preview. They are not completed runtime tests of approval ordering, preview delivery, saved-session continuation, or replay prevention. The Pi host and installed extensions remain trusted; these labels do not prove physical human presence.

## ADF validation sources

The official [ADF structure guide](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) was fetched. It links a JSON schema and warns that schema-valid nodes and marks may still be unsupported by a specific Jira implementation. Jira rejection must remain an expected result.

The [published schema for `@atlaskit/adf-schema` version 57.7.26](https://unpkg.com/@atlaskit/adf-schema@57.7.26/dist/json-schema/v1/full.json) was fetched. It uses JSON Schema draft-04 and references the document definition as its root.

Read-only npm metadata checks reported:

- `@atlaskit/adf-schema` version `57.7.26`, Apache-2.0 license, with editor-related dependencies.
- `ajv` version `8.20.0`, MIT license.
- `ajv-draft-04` version `1.0.0`, MIT license, with an `ajv` peer dependency of `^8.5.0`.

No dependency was added or installed for these checks. No schema was copied into package source. Compiler, runtime, license-file, package-content, and conversation approval checks remain implementation acceptance gates.
