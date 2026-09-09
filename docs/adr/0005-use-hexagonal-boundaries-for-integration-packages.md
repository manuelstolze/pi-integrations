---
status: accepted
---

# Use hexagonal boundaries for integration packages

Integration packages use thin domain rules, application use cases and ports, and adapters for Pi and external systems. The package entry point composes these parts, while the application and domain layers stay independent of Pi APIs and command-line tools. This keeps integration policy testable with fakes, isolates provider-specific code, and gives future packages a clear structure without changing their public extension API.
