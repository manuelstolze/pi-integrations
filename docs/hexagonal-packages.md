# Hexagonal architecture for extension packages

Use this structure for an extension package with meaningful rules and
workflows. It keeps package rules and workflows separate from Pi and outside
services. Simple example packages can stay small.

## Layers and dependencies

Dependencies point inward. The `infrastructure` and `interface` layers depend
on `application` and `domain`. The `application` layer depends on `domain`.

```text
infrastructure ─┐
                ├──> application ───> domain
interface ──────┘
```

- `domain` holds stable package terms and pure rules. It does not import
  application code, Pi APIs, or system APIs.
- `application` holds workflows and policy. It may import domain code and
  declares ports, which are interfaces to outside services.
- `infrastructure` implements ports for file access, processes, and external
  systems. It may use Node.js APIs and provider clients.
- `interface` handles calls into the package. For a Pi extension, it registers
  events and commands, renders prompts, and maps Pi input to application calls.
- `src/index.ts` is the composition root: it creates the outside layers and
  connects them to the application.

Do not use folder names alone to claim this architecture. The import direction
must follow the dependency rule.

## Source layout

Use layer-first folders. Add capability folders when a layer has more than one
concern.

```text
src/
├── domain/
├── application/
│   ├── ports/
│   └── use-cases/
├── infrastructure/
│   ├── config/
│   ├── external-system/
│   └── process/
├── interface/
│   └── pi/
└── index.ts
```

Keep the domain layer small unless it owns rules that protect a real package
concept. Do not create domain objects only to wrap command output.

## Domain

Put stable, provider-neutral types and pure rules in `domain/`. Examples are
workflow modes, provider names, and rules that map an origin host to a provider
hint.

The domain must not know whether a rule is used by a slash command, a tool, or
a background job.

## Application

Put user goals and workflow coordination in `application/`. A use case should
accept typed input, call ports, apply policy, and return typed output.

Define ports by capability. For example, use a repository port for repository
facts and a hosting port for provider facts. Do not expose a generic command
runner to the application. If the application builds `git`, `gh`, or `glab`
arguments, provider details have crossed the boundary.

Return typed results that describe valid states. Use a tagged union when some
modes require data that other modes do not require.

## Infrastructure

Put code that uses storage, process, or provider APIs in `infrastructure/`.
Each infrastructure component implements a port declared by the application.
Keep provider-specific components separate when their commands or failure
rules differ.

## Interface

Put code that receives requests from a person or host application in
`interface/`. A Pi interface handles commands, events, prompts, Pi messages,
and Pi session state.

Keep prompt text and Pi-specific output in this layer. The application returns
typed data. The interface may render Markdown, add provider command examples,
and limit output for the model context.

## Testing

Use four test levels:

1. Domain tests cover pure rules without fakes.
2. Application tests use fake ports and cover workflow decisions.
3. Infrastructure tests cover storage, process calls, and result mapping.
4. Interface tests cover host lifecycle, input mapping, and output rendering.

The package should expose only its intended public extension API. Keep ports,
use cases, infrastructure code, and interface code internal unless consumers
need them as a supported library API.

## Git integration example

`packages/git-integration` follows the inward dependency rule, but its current
source groups outside code under `adapters/`. Move those files into
`infrastructure/` and `interface/` when that package is next changed.

- The domain owns `GitMode`, `HostingProvider`, and the origin-host hint rule.
- The application prepares one mode-aware Herald run through Git and hosting
  ports.
- Git, GitHub, GitLab, and process code belong in `infrastructure/`; Pi code
  belongs in `interface/`.
- The entry point connects the layers and exports the Pi extension.
