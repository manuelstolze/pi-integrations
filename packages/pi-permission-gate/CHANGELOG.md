# @manuelstolze/pi-permission-gate

## 1.1.0

### Minor Changes

- 2ec3a26: Require Pi 1.3.0 or later within the 1.x line. Pi 1.1.x and 1.2.x are no longer supported.
  
  Model-warning and permission-gate also require Pi TUI 1.3.0 or later within the 1.x line. Pi TUI 1.1.x and 1.2.x are no longer supported by these packages.
  
  Extension behavior and the Node.js minimum of 22.19.0 are unchanged.

## 1.0.1

### Patch Changes

- 82b1620: Update the package repository directory metadata to `packages/pi-permission-gate`.

## 1.0.0

### Major Changes

- 1897f93: Drop support for Pi API and Pi TUI 0.x hosts. Require Pi API and Pi TUI 1.1.0 or later in the 1.x line and Node.js 22.19.0 or later.

## 0.2.1

### Patch Changes

- 35c55eb: Refactor the permission gate into separate architecture layers without changing its extension API.

## 0.2.0

### Minor Changes

- 1eab0b0: Add a permission gate extension that prompts before dangerous bash commands.
