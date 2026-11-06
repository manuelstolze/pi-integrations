---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Repository paths below are relative to the repository root.

## How — via the AskUserQuestion tool (user clicks an option or types their own)

In Pi, or wherever AskUserQuestion is not available, ask the same numbered options in plain text and wait for the answer.

- **Many small questions, not few big ones** — one decision per question; favour simple atomic choices over compound ones.
- **Propose 2–4 concrete answers** each; put your **recommendation first**, suffixed "(Recommended)", with a one-line why. "Other" lets them type a custom answer. Use `multiSelect` when options can co-apply.
- **Explore first** — read `CONSTITUTION.md`, `AGENTS.md`, the relevant specification in Headquarter's `specs/pi-integrations/`, and the code to answer; only ask what genuinely needs the human. Ask the owner for the Headquarter path if it is unknown.
- **One branch at a time** — walk the decision tree; ask in focused rounds, never a pile at once.
- **Reflect back** the compound understanding in 1–2 lines whenever a key insight lands or a confusion clears, to keep a running shared picture.
- Continue until nothing load-bearing is unknown: scope, edge cases, data shape, UX, errors, **non-goals**, done-criteria.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```
