# Domain documentation

This repository uses a multi-context layout. Each context has its own vocabulary and rules.

## Layout

- `GLOSSARY-MAP.md` lists the repository and package glossaries and their relationships.
- `GLOSSARY.md` defines shared repository terms. Each package has its own `GLOSSARY.md` for package terms.
- `CONTRIBUTING.md` holds shared package, compatibility, and release rules.
- Each package's `README.md` holds its behavior, interface, and implementation rules.
- `docs/adr/` contains architecture decision records (ADRs) that apply across the repository.
- A context may have a local ADR directory for decisions that apply only to that context.

The repository and package context files named by the constitution are these glossaries and rule documents.

## Consumer rules

1. Read `GLOSSARY-MAP.md` before working on domain behavior.
2. Read the root glossary and the affected package glossaries for terms.
3. Read `CONTRIBUTING.md` and the affected package README files for rules and behavior.
4. Read relevant root and local ADRs before changing a documented decision.
5. Keep glossaries limited to domain terms. Follow the domain-modeling skill's `GLOSSARY-FORMAT.md`.
6. Update the relevant glossary when terms change. Update `GLOSSARY-MAP.md` when contexts or their relationships change.
7. Update the relevant rule document or ADR when a documented rule or decision changes.
8. Treat generated files and build output as implementation evidence, not as domain documentation.
