---
id: GIT-004
domain: git-integration
services:
  - "@manuelstolze/pi-git-integration"
product: Pi Git Integration
status: approved
owner: Manuel Stolze
---

# Configure the Herald model and thinking level

## 1. Problem and intent

Herald currently uses the active Pi chat model. The owner wants to select a different model for Herald through `settings.json`.

Herald must also support a separate thinking level. A thinking level controls how much reasoning a model performs before it answers. These choices must apply only during Herald. They must not replace the user's normal chat choices after Herald ends.

The owner approved this specification in the conversation. Planning may start. Code changes still require approval of the plan and implementation tasks.

## 2. Scope

### In scope

- Add optional `herald.model` and `herald.thinkingLevel` settings.
- Read user and project settings before each Herald command.
- Apply project overrides per field.
- Apply the selected values during all Herald modes.
- Restore previous chat values after Herald ends, while preserving later manual selections.
- Warn and continue with usable values when a configured choice is invalid or unavailable.
- Explain how to fix each warning.
- Add tests and update package usage and context documentation.
- Add a minor Changeset for the new package feature. A Changeset records a published package change and its required version update.

### Out of scope

- Select or recommend a specific AI model for the owner.
- Change Pi's normal startup model or thinking settings.
- Add model selection arguments to `/herald`.
- Add separate model settings for each Herald mode.
- Move Herald to a separate chat session or agent.
- Write or overwrite personal settings, credentials, or model definitions.
- Discover custom agent directories passed only through Pi's embedded-application interface. The owner confirmed support for the normal Pi agent directory and `PI_CODING_AGENT_DIR` instead.
- Change Git mode limits, approval checks, hosting-provider selection, or review-request behavior.

## 3. Requirements

### Settings

- **FR-001:** Herald MUST accept an optional `herald` object in `settings.json` with optional `model` and `thinkingLevel` fields.
- **FR-002:** `herald.model` MUST be one string in the form `provider/modelId`. The provider identifies the model service. The value MUST identify an exact model registered with Pi. Herald MUST NOT guess a model from a partial name.
- **FR-003:** `herald.thinkingLevel` MUST accept Pi's supported thinking-level names. The package documentation MUST list the accepted values for the supported Pi version.
- **FR-004:** Herald MUST read settings from Pi's normal agent directory, honoring `PI_CODING_AGENT_DIR`, and the current project's `.pi/settings.json`. A project value MUST override the user value for that field only. Other fields MUST retain their user values. Project settings MUST remain subject to Pi's project-trust checks.
- **FR-005:** Herald MUST read these settings before each command run. A settings change MUST apply to the next run without requiring `/reload`. A settings edit MUST NOT change a run already in progress.
- **FR-006:** When neither field is set, Herald MUST retain its current behavior. When only one field is set, the other MUST retain the current chat value where the selected model supports it.

Example shape; `provider/modelId` is a placeholder, not a working model selection:

```json
{
  "herald": {
    "model": "provider/modelId",
    "thinkingLevel": "high"
  }
}
```

### Run behavior and restoration

- **FR-007:** The resolved settings MUST apply to `/herald`, `/herald commit`, and `/herald request`.
- **FR-008:** A usable configured model MUST be active for Herald's model requests. A valid configured thinking level MUST apply when the selected model supports it.
- **FR-009:** If no thinking level is configured, Herald MUST keep the current chat thinking level where supported. It MUST NOT substitute the selected model's startup thinking setting.
- **FR-010:** Herald MUST restore the previous chat model and thinking level after the run completes, fails, or is cancelled. A failed start MUST NOT leave a Herald-only setting active. Temporary settings MUST NOT carry into a different session or survive an extension reload.
- **FR-011:** Restoration MUST preserve a model or thinking-level selection that the user makes manually during Herald. Herald MUST restore only values that it still controls. It MUST NOT repeatedly force its settings after a manual selection. The owner approved one exception: if the previous model cannot support a later manual thinking choice, restore that model and use a supported thinking level. Warn about the adjustment and explain how to change the model or thinking level.
- **FR-012:** Herald MUST NOT persist temporary model or thinking-level changes to settings files.

### Warnings and continued operation

- **FR-013:** If a configured model is invalid, unknown, or lacks usable credentials, Herald MUST warn and continue with the active chat model. It MUST NOT silently choose another model. This fallback does not guarantee that the chat model itself can complete a request.
- **FR-014:** If the thinking level is invalid or unsupported by the model used for the run, Herald MUST warn and continue with a level supported by that model. This warning MUST NOT discard an otherwise usable configured model.
- **FR-015:** Each warning MUST identify the affected setting, explain the problem, state the value used instead, and give concrete correction steps. It MUST identify the settings file responsible when applicable. It MUST NOT expose credentials.
- **FR-016:** Correction steps for an unknown or invalid model MUST explain how to set an exact available `provider/modelId` or remove `herald.model`. Missing-credential warnings MUST explain how to authenticate or configure credentials for the named provider, or remove the setting. Thinking-level warnings MUST explain how to select a supported level or remove `herald.thinkingLevel`.

### Existing contracts and delivery

- **FR-017:** Existing command meanings, mode limits, Git context collection, hosting-access checks, and approval requirements MUST remain unchanged.
- **FR-018:** Tests MUST cover settings resolution, temporary selection, restoration, preserved manual selections, warnings with correction steps, and unchanged behavior without Herald settings.
- **FR-019:** Package documentation MUST describe the settings shape, settings locations, per-field overrides, refresh timing, temporary behavior, and warning correction steps. Package context documentation MUST record the new stable behavior.
- **FR-020:** A minor Changeset MUST record this feature for `@manuelstolze/pi-git-integration`.

## 4. Capability deltas

- **Added:** The owner can select Herald's model and thinking level through user or project settings.
- **Added:** Project settings override user settings per field. Each Herald command reads current settings.
- **Added:** Herald restores temporary choices while preserving later manual selections.
- **Added:** Invalid or unavailable selections produce warnings with correction steps and usable fallback values.
- **Modified:** Herald may use a model other than the active chat model during its run.
- **None:** Git command approval, mode action limits, provider selection, and review-request rules do not change.

## 5. Acceptance criteria

1. Given a usable exact `herald.model`, each of the three Herald commands uses that model during the run.
2. Given no Herald settings, each command retains the current chat model and thinking level without a configuration warning.
3. A project model overrides the user model without discarding a user thinking level. A project thinking level overrides the user level without discarding a user model.
4. A change to either settings file applies to the next Herald command without `/reload`. It does not alter an active run.
5. A valid configured thinking level applies during Herald when the selected model supports it. With no thinking setting, Herald keeps the current chat level where supported.
6. Normal completion, failure, cancellation, and failed starts do not leave Herald-only choices active for later chat work. Session changes and extension reloads do not leak temporary choices.
7. A manual model or thinking-level selection made during Herald remains selected afterward. Restoration still applies to any unchanged value that Herald controls. If restoring the previous model makes a manual thinking choice unsupported, restore the previous model, use a supported level, and warn with correction steps.
8. An invalid or unknown model produces a warning and Herald uses the chat model. A model without usable credentials has the same fallback behavior.
9. Model warnings identify the effective source setting, the problem, the fallback, and concrete correction steps. Credential warnings do not reveal secrets.
10. An invalid or unsupported thinking level produces a warning and uses a supported level without discarding a usable Herald model. The warning explains how to fix or remove the setting.
11. Existing allowed Git actions still require approval. Disallowed mode actions remain blocked.
12. Package tests, usage documentation, context documentation, and a minor Changeset cover the new behavior.

## 6. Domain notes

Use the terms in `packages/git-integration/CONTEXT.md`.

The AI model provider in `herald.model` is not the Git hosting provider. Changing the AI model must not change whether GitHub or GitLab hosts the repository.

Preserve ADR-0003 and ADR-0004: hosting access and the shared review-request flow remain unchanged.

Preserve ADR-0005: package rules and application workflows remain independent of Pi and system APIs. This feature does not change the package boundaries.

## 7. Events and API contracts

- The new public configuration fields are `herald.model` and `herald.thinkingLevel`.
- The three existing Herald commands retain their current names and arguments.
- Herald uses the current chat session. This feature does not create an independent agent.
- Model and thinking-level selections are temporary run behavior, not changes to Pi startup defaults.
- Existing repository and hosting-provider contracts remain unchanged.

## 8. Open questions

None for the agreed product behavior. During planning, the owner confirmed that custom agent directories passed only by an application that embeds Pi are out of scope. Standard Pi directory selection, including `PI_CODING_AGENT_DIR`, remains supported. The technical plan must verify the supported Pi APIs for settings access, model and credential checks, thinking-level support, manual-change detection, and restoration across cancellation, reload, and session changes. If these APIs cannot meet a requirement, stop and ask the owner before changing the agreed behavior.

## 9. Delivery notes

- **Branch:** `feat/configure-herald-model`
- **Commit subject:** `✨ feat(git-integration): configure Herald model and thinking level`
- **Pull request title:** `✨ feat(git-integration): configure Herald model and thinking level`
- **Pull request summary:** Add temporary Herald model and thinking-level settings with per-field project overrides. Restore chat choices, preserve manual selections, and provide warnings with correction steps.
- **Approval gate:** The owner must approve this specification, the technical plan, and the implementation tasks before any code changes.
