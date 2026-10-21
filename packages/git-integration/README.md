# @manuelstolze/pi-git-integration

A Pi extension for guided Git commits, pushes, and GitHub pull requests or GitLab merge requests.
It collects Git context, creates a commit plan, and asks for approval before
it performs permanent Git actions.

## Compatibility

Requires Node.js 22.19.0 or later and Pi API 1.3.0 or later in the 1.x line.
Pi API versions below 1.3.0 are not supported.

## Installation

```bash
pi install npm:@manuelstolze/pi-git-integration
```

The extension detects the hosting provider from the `origin` remote. It uses
`gh` for GitHub and `glab` for GitLab. For self-hosted GitLab, the extension
probes `glab` against the current repository.

Install and authenticate the matching CLI if you want to use the request flow.

## Usage

Run the following commands inside a Pi session:

```text
/herald             # full mode: commits, push, and review requests
/herald commit      # commit mode: commits only
/herald request     # request mode: push and review requests for existing commits
```

Commit mode blocks push and review-request commands. Request mode blocks commit
commands. Full mode allows all four action types: commits, pushes, GitHub pull
requests, and GitLab merge requests. Before each allowed action, the extension
asks for approval and shows the exact Bash command. It blocks mixed commands
that include a disallowed action, commands when no user interface is available,
and commands that the user does not approve.

The extension reads `CONTRIBUTING.md` before it plans commits or a review
request. Request and full modes require a usable `origin` remote and a working,
authenticated hosting CLI. Commit mode works without either.

After `git init`, use `/herald commit` to prepare the first commit. Herald
reports that no commits exist and retains available branch and change information.
This works regardless of the language of Git error messages. Other Git failures
remain errors. Full mode also supports the first commit when its remote and
hosting-access requirements are met. The same approval rules still apply.

## Herald model settings

By default, Herald uses the current chat model and thinking level. A thinking
level controls how much reasoning a model performs before it answers.

To use different values during Herald, add this object to your Pi agent
`settings.json` or your project's `.pi/settings.json`:

```json
{
  "herald": {
    "model": "provider/modelId",
    "thinkingLevel": "high"
  }
}
```

`provider/modelId` is a placeholder. Open `/model` to find an available model,
then use its exact provider and model ID. For example, a model ID that contains
`/` stays intact after the first `/` separator. Partial model names are not
supported.

Both fields are optional. Accepted thinking-level names are `off`, `minimal`,
`low`, `medium`, `high`, `xhigh`, and `max`. A model may support only some of
these levels. Use `/thinking` to see its supported choices.

The user settings file is normally `~/.pi/agent/settings.json`. Herald honors
`PI_CODING_AGENT_DIR` when that environment variable selects another agent
directory. Custom agent directories passed only by applications that embed Pi
are not discovered by this extension.

Project settings apply only when Pi trusts the project. They override user
settings per field. For example, a project can replace `herald.model` while
keeping the user's `herald.thinkingLevel`. An invalid project value does not
reactivate the user value it replaced.

Herald reads these settings at the start of every `/herald`, `/herald commit`,
or `/herald request` command. No `/reload` is needed. Edits during a run affect
only the next run. An absent field keeps the current chat value where the model
supports it. Switching models does not substitute that model's startup thinking
level for the chat level.

The selected values apply only during Herald. When the run ends or is
cancelled, Herald restores the previous chat values. It also restores them
before an extension reload or session change. It does not write startup
defaults or edit settings files.

A model or thinking level you select manually during Herald remains selected
afterward where supported. If Herald restores the previous model and that
model cannot support your manual thinking choice, Herald restores the model,
uses a supported thinking level, and warns. Use `/thinking` or `/model` to
adjust that result. Starting another Herald command while one is active is
not supported.

### Fixing settings warnings

Warnings identify the setting, its source file, the value used instead, and
correction steps:

- **Invalid or unknown model:** Open `/model`. Set `herald.model` to an exact
  available `provider/modelId`, or remove the field. Herald uses the chat
  model until the setting is fixed.
- **Missing model authentication:** Run `/login` for the named provider, or
  configure that provider's credentials. You can also remove `herald.model`.
  Herald uses the chat model instead. A configured credential does not prove
  that a remote service will accept it; remote request failures still end the
  run under Pi's normal rules.
- **Invalid thinking level:** Set `herald.thinkingLevel` to an accepted name,
  or remove the field. Herald requests the chat thinking level instead.
- **Unsupported thinking level:** Open `/thinking` to find a supported level,
  then update or remove `herald.thinkingLevel`. Herald keeps a usable selected
  model and uses a supported thinking level.
- **Unreadable settings or invalid JSON:** Fix access or syntax in the named
  file before the next command. Herald ignores that file and keeps valid
  settings from the other source where available. It does not repair files.
- **Restoration failure:** Use `/model` and `/thinking` to restore your choices.
  Check `/login` if the previous model has become unavailable.

Normal shutdown and cancellation run cleanup. A forced process termination
cannot run cleanup. Temporary choices can remain in that session's transcript;
check `/model` and `/thinking` when resuming after a forced termination.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-git-integration
npm run typecheck
```

The extension source is in `src/`. The compiled entry point is
`dist/index.js`.

The package follows the repository's hexagonal package structure. See
[`../../docs/hexagonal-packages.md`](../../docs/hexagonal-packages.md) for the
layer and testing rules.
