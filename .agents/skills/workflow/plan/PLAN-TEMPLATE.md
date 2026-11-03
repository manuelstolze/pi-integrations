# Technical plan: <title>

<!-- Save as specs/<area>/<change>/plan.md beside the approved spec.md.
Replace placeholders with verified facts. Keep sections brief. Use "None" or
"Not applicable" with a reason when a section does not apply.
Repository paths below are relative to the repository root. -->

## 1. Status and approval

- **Specification:** `specs/<area>/<change>/spec.md`
- **Specification approval:** <owner and approval reference; required before planning>
- **Plan status:** Draft — owner approval pending.
- **Task breakdown:** Not started — requires plan approval.

Implementation can start only after the owner approves `spec.md`, `plan.md`,
and `tasks.md`, as required by `CONSTITUTION.md`.

## 2. Context and evidence

- **Current behavior:** <what the relevant source and tests show; cite file paths>
- **Approved outcome:** <requirements from spec.md that this plan implements>
- **Context read:** `GLOSSARY-MAP.md`, `GLOSSARY.md`, `CONTRIBUTING.md`, <affected package glossaries and README files>
- **Applicable decisions:** <architecture decision record (ADR) paths and constraints, or None>
- **Evidence:** <commands already run, results, and source references>
- **Assumptions and unknowns:** <unverified points and how to check them>

Separate observed behavior from assumptions. Mark checks that have not run.

## 3. Technical approach and boundaries

<Explain how the change meets the approved requirements. Describe the data flow,
state changes, failure handling, and cleanup where relevant.>

- **Affected packages or repository areas:** <paths and responsibilities>
- **Module boundaries:** <what each affected module owns and what stays unchanged>
- **Public contracts:** <commands, tools, settings, exports, or other interfaces that change>
- **Dependencies:** <additions or updates, reasons, and lockfile impact, or None>
- **Migration and compatibility:** <existing users, settings, or stored data affected, or None>

Keep each extension's source, tests, and package documentation inside its package.
For external-system integrations, apply `docs/hexagonal-packages.md`. Identify
changes to domain logic, use cases, external-service code, and Pi interface code
when relevant. Keep `src/index.ts` as the composition root, where these parts
are connected.

Keep accepted ADR decisions unchanged. If a new or changed decision is needed,
follow `docs/adr/README.md` before implementation.

## 4. Affected files

| Path | Planned change | Requirement served |
| --- | --- | --- |
| `packages/<package>/src/<file>.ts` | <implementation change> | <spec requirement> |
| `packages/<package>/test/<file>.test.ts` | <test coverage> | <acceptance criterion> |
| <other affected path> | <change> | <requirement or repository rule> |

List only files needed for this change. Include package manifests and the root
`package-lock.json` when dependencies change. Edit source files, not `dist/`.

## 5. Documentation and release impact

| Artifact | Required update, or reason no update is needed |
| --- | --- |
| Affected package `README.md` | <usage, setup, or compatibility changes> |
| Root or package `GLOSSARY.md`, or `GLOSSARY-MAP.md` | <changed terms or context relationships> |
| `CONTRIBUTING.md` or package `README.md` | <changed stable rule or behavior> |
| Public contract documentation | <changed interface and compatibility notes> |
| ADR | <required decision process, or existing decision preserved> |
| `.changeset/<name>.md` | <affected package names, version bump, and reason> |

Use `CONTRIBUTING.md` to determine whether a Changeset is required. A Changeset
is a release note that identifies affected packages and their version bumps.
Documentation-only and repository-only changes normally do not need one.

## 6. Verification strategy and acceptance gates

Map each acceptance criterion in `spec.md` to a test or other check.

| Acceptance criterion | Test or check | Required result |
| --- | --- | --- |
| <criterion reference> | <test path, command, or manual steps> | <observable result> |

- **Behavior coverage:** <normal cases, failure cases, and relevant boundary cases>
- **Bug reproduction, if applicable:** <sequence and expected failure before the fix>
- **External services:** <local substitutes, required access, and checks that need owner action>
- **Manual checks:** <steps and expected results, or reason none are needed>

List exact commands to run from the repository root. Select checks that match
the change using `CONTRIBUTING.md`. For package code changes, include the
relevant package tests, `npm run typecheck`, `npm run build`, and `npm test`.
Include `git diff --check` for the final review.

Record actual results during implementation in `tasks.md`. Report failed and
unrun checks separately. A planned check is not a passing result.

## 7. Work sequence, risks, and open points

1. <first implementation step after all approvals>
2. <next step and dependency on earlier work>
3. <documentation, release notes, and final verification>

Keep this sequence at plan level. Define individual tasks and their acceptance
gates in `tasks.md` after plan approval.

| Risk or open point | Impact | Check or decision needed |
| --- | --- | --- |
| <risk, assumption, or unresolved question> | <possible effect> | <action and owner> |

Identify commands that replace installed dependencies, change configuration,
or have irreversible effects. Obtain the required owner approval before running
them. If implementation requires a guardrail exception or a workaround, stop
and ask the owner. Record an approved exception and any removal plan in the spec
or an ADR.

## 8. Delivery and approval checkpoint

Follow `CONTRIBUTING.md` for branch names, commit subjects, and pull requests.

- **Proposed branch:** `<type>/<optional-issue-number>-<short-description>`
- **Proposed commit subject:** `<emoji> <type>(<scope>): <imperative subject>`
- **Pull request title:** <title>
- **Pull request summary:** <reason, scope, verification, release impact, and known limits>
- **Existing work to preserve:** <relevant working-tree changes, or None>
- **Owner decisions needed:** <open choices or risky operations, or None>

Present this plan for owner approval before writing `tasks.md`. Record approval
only after the owner gives it. This plan does not authorize implementation,
Git history changes, or publication.
