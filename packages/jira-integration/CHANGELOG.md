# @manuelstolze/pi-jira-integration

## 1.0.0

### Major Changes

- 1897f93: Drop support for Pi API 0.x hosts. Require Pi API 1.1.0 or later in the 1.x line and Node.js 22.19.0 or later.

### Patch Changes

- a38af39: Separate Jira rules, workflows, CLI access, and Pi tools into internal layers without changing the package contract.

## 0.2.1

### Patch Changes

- 9af8c51: Declare the host-provided `typebox` package as a peer dependency to avoid duplicate runtime modules and extension loader warnings.

## 0.2.0

### Minor Changes

- e36494a: Add read-only Jira tools and the bundled `jira-integration` skill.
