# Hexagonal architecture for integration packages

Use this structure for a package that connects Pi to an external system. The
structure keeps the package rules independent from Pi and from command-line
programs.

## Dependency rule

Dependencies point inward:

```text
domain → application → adapters → external systems
```

- `domain` does not import application code, Pi APIs, or process APIs.
- `application` may import domain types and port interfaces only.
- `adapters` implement ports and may import Pi APIs, Node.js process APIs, and
  provider clients.
- `src/index.ts` is the composition root. It creates adapters and connects
  them to the application.

Do not use folders alone to claim the architecture. The import direction must
follow the rule.

## Source layout

Use layer-first folders. Add capability folders when a layer has more than one
concern.

```text
src/
├── domain/
├── application/
│   ├── ports/
│   └── use-cases/
├── adapters/
│   ├── process/
│   ├── external-system/
│   └── pi/
└── index.ts
```

Keep the domain layer small unless it owns rules that need to protect a real
business concept. Do not create domain objects only to wrap command output.

## Domain

Put stable, provider-neutral types and pure rules in `domain/`. Examples are
workflow modes, provider names, and rules that map an origin host to a provider
hint.

The domain must not know whether a rule is used by a slash command, a tool, or
a background job.

## Application

Put user goals and workflow coordination in `application/`. An application use
case should accept typed input, call ports, apply policy, and return typed
output.

Define ports by capability. For example, use a repository port for repository
facts and a hosting port for provider facts. Do not expose a generic command
runner to the application. If the application builds `git`, `gh`, or `glab`
arguments, provider details have crossed the boundary.

Return typed results that describe valid states. Use a discriminated union when
some modes require data that other modes do not require.

## Adapters

Put all outside-system code in `adapters/`:

- A process adapter runs external commands and maps process results.
- An external-system adapter implements a port for one provider or service.
- A Pi adapter registers commands, handles events, renders Pi messages, and
  owns Pi session state.

Keep provider-specific adapters separate when their commands or failure rules
differ. A provider-neutral facade may select the correct adapter.

Prompt text is a Pi concern. The application should return typed data. The Pi
adapter may render Markdown, add provider command examples, and limit output
for the model context.

## Testing

Use three test levels:

1. Domain tests cover pure rules without fakes.
2. Application tests use fake ports and cover workflow decisions.
3. Adapter tests cover command arguments, result mapping, and Pi lifecycle
   behavior without requiring real external services.

The package should expose only its intended public extension API. Keep ports,
use cases, and adapters internal unless consumers need them as a supported
library API.

## Git integration example

`packages/git-integration` follows this structure:

- The domain owns `GitMode`, `HostingProvider`, and the origin-host hint rule.
- The application prepares one mode-aware Herald run through Git and hosting
  ports.
- Git, GitHub, GitLab, process, and Pi code live in adapters.
- The entry point composes the adapters and exports the Pi extension.
