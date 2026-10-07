---
status: proposed
date: YYYY-MM-DD
approvers:
  - <person or people who approve the decision>
related:
  - <related ADRs or other documents>
last_reviewed: "YYYY-MM-DD — valid | outdated"
amended_by: ADR-NNNN
---

# ADR NNNN — <Title>

`status` is required. Add other metadata only when it is known or applies. Omit unused fields.

_This template defines structure only. Status rules, immutability, amendment, supersession,
reviews and fact corrections are defined in [`README.md`](README.md#lifecycle)._

## TL;DR

One or two sentences: the decision and the single most important reason for it. A reader
should be able to stop here and know what we chose and why.

## Dependencies

Decisions this ADR leans on that are not yet settled. For each, state the assumption we
are making and what would force us to revisit this ADR.

- **<Dependency / future ADR>** (future, TBD number). **Assumption:** <what we assume to be
  true>. **Review trigger:** <the condition that would invalidate this decision>.

_Omit this section if the decision has no open dependencies._

## Context

What is the problem? What forces are at play (technical, business, regulatory)? State the
key decision drivers and any hard constraints.

**Scope:** what this ADR is — and, just as important, what it is _not_.

## Options in scope

The candidates actually considered, grouped where useful. Give each a short characterization
and its main trade-off.

### Comparison

| Criterion   | Option A | Option B |
| ----------- | -------- | -------- |
| <criterion> | ✅ …     | ⚠️ …     |

Legend: ✅ good · ⚠️ neutral / caveat · ❌ bad · ⚪ n/a

**Choosing the criteria:** propose a concrete set of comparison criteria yourself — do not
leave this open. Derive them from the decision drivers and hard constraints in _Context_.
Then involve the human decider: present the proposed criteria and explicitly ask whether
any are missing or should be weighted differently before finalizing the comparison.

_Omit this section for decisions without meaningful alternatives to compare._

## Decision

The decision, stated in active voice: "We will …". Follow with the reasoning that ties it
back to the decision drivers, and an implementation baseline if helpful.

## Consequences

- **Positive:** …
- **Negative / trade-offs:** …
- **Follow-ups:** …

## Alternatives considered

List **every** option from the Comparison table above (except the chosen one) by name, each
with a short reason why we decided against it.

- **<Option name>** — why we decided against it.
- **<Option name>** — why we decided against it.
- **<Option name>** — why we decided against it.

_Omit this section if there is no "Options in scope" / Comparison — with no compared options
there is nothing to list here._

### Eliminated early (out of scope)

- **<Option>** — why it was ruled out before detailed comparison.

_Omit this subsection if nothing was eliminated up front._
