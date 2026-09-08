# Domain documentation

This repository uses a multi-context layout.

## Layout

- `CONTEXT-MAP.md` maps the repository to its domain and package context files.
- Each domain or package can have its own `CONTEXT.md`.
- `docs/adr/` contains architecture decision records that apply across the repository.
- A context may have a local ADR directory when the context needs decisions that do not apply to the full repository.

## Consumer rules

1. Read `CONTEXT-MAP.md` before working on domain behavior.
2. Read the context files that cover the requested package or domain.
3. Read relevant root and local ADRs before changing a documented decision.
4. Keep context files focused on stable domain rules and vocabulary.
5. Update the relevant context or ADR when a change alters a documented rule or decision.
6. Do not treat generated files, build output, or package README files as domain context unless the map points to them.
