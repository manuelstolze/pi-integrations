---
status: accepted
last_reviewed: "2026-10-07 — outdated"
---

# Adopt Hexagonal + DDD Architecture

## Decision

Use Domain-Driven Design (DDD) for extension packages with meaningful workflows.
DDD organizes code around package rules. Use Hexagonal (Ports and Adapters)
architecture to keep these rules independent of Pi and system code. Use four
layers:

- **Domain** holds package terms and pure rules.
- **Application** coordinates workflows and declares ports. A port is an
  interface that lets the application call an outside service.
- **Infrastructure** implements ports for files, processes, and external
  systems.
- **Interface** handles calls from Pi or another host and maps them to the
  application.

Dependencies point inward. `src/index.ts` creates and connects the outer
layers. Apply this structure as each package is changed. Do not refactor every
package in one change. Keep simple example packages small. Keep each package's
public extension API stable during a structural refactor.

## Rationale

This keeps package rules independent of Pi and system APIs. It makes rules and
workflows testable with fake ports, separates provider-specific code, and gives
packages a shared structure.

## Alternatives considered

- Keep Pi events, prompts, config access, and permission rules together in the
  extension entry point.
- Keep one `adapters/` layer for both Pi interface code and infrastructure.

## Trade-offs

- The four layers add folders, interfaces, and rules for imports.
- Refactors need more initial work and tests to keep the boundaries clear.
- Simple packages do not need to create domain objects unless those objects
  protect real package concepts.

See [`docs/hexagonal-packages.md`](../hexagonal-packages.md) for the layer
rules, source layout, and test guidance.
