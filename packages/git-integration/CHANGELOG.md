# @manuelstolze/pi-git-integration

## 1.1.1

### Patch Changes

- 5da40a4: Keep the Herald model, thinking level, instructions, and mode checks active while waiting for approval in chat. Restore chat selections after explicit workflow completion. Add `/herald cancel` to leave an unfinished workflow without reversing completed Git actions.

## 1.1.0

### Minor Changes

- cad3fe4: Add optional Herald model and thinking-level settings in user and trusted project settings.json files. Apply project overrides per field and read settings before each command. Restore temporary selections after each run while preserving later manual choices where supported. Show settings warnings with correction steps and retain the existing Git mode and approval checks.
- 2ec3a26: Require Pi 1.3.0 or later within the 1.x line. Pi 1.1.x and 1.2.x are no longer supported.
  
  Model-warning and permission-gate also require Pi TUI 1.3.0 or later within the 1.x line. Pi TUI 1.1.x and 1.2.x are no longer supported by these packages.
  
  Extension behavior and the Node.js minimum of 22.19.0 are unchanged.

## 1.0.2

### Patch Changes

- 96a9420: Support the first commit after `git init` without relying on the language of Git error messages. Preserve real Git errors, mode limits, remote requirements, and approval rules.

## 1.0.1

### Patch Changes

- 406185c: Enforce Herald mode action limits and show the exact command before approval.

## 1.0.0

### Major Changes

- 1897f93: Drop support for Pi API 0.x hosts. Require Pi API 1.1.0 or later in the 1.x line and Node.js 22.19.0 or later.

### Patch Changes

- e171802: Move Git integration internals into separate architecture layers without changing its public behavior.

## 0.2.0

### Minor Changes

- d414db9: Add a Git integration extension for guided commits, pushes, and GitHub or GitLab review requests.
