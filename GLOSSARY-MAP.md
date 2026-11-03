# Glossary Map

This repository contains independently published Pi coding agent extensions.

## Contexts

| Context | Glossary | Scope |
| --- | --- | --- |
| Repository | [Repository](./GLOSSARY.md) | Shared extension and release terms |
| Hello World extension | [Hello World](./packages/hello-world/GLOSSARY.md) | The example extension and package template |
| Pi Permission Gate | [Pi Permission Gate](./packages/pi-permission-gate/GLOSSARY.md) | Command checks and user permission |
| Jira integration | [Jira integration](./packages/jira-integration/GLOSSARY.md) | Jira reads and approved description updates |
| Git integration | [Git integration](./packages/git-integration/GLOSSARY.md) | Guided Git commits and hosted repository review requests |
| Model Warning extension | [Model Warning](./packages/pi-model-warning/GLOSSARY.md) | Warnings when an Opus model becomes active |

## Relationships

- Each extension uses the shared terms in the repository glossary.
- Hello World is the reference package and template for new extensions.
- Each extension owns its package terms and behavior. The extensions are published independently.
- Git and Jira each define approval for their own workflows. Approval in one workflow does not grant permission in another.

Read the repository glossary first. Then read the glossary for the affected package.
For behavior, implementation, and release rules, follow [domain documentation guidance](./docs/agents/domain.md).
