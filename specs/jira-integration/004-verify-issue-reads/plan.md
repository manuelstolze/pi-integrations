# Technical plan: Verify issue reads through jira_view

## 1. Status and approval

- **Specification:** [spec.md](spec.md), approved by the human owner in the
  conversation.
- **Plan status:** Approved by the human owner in the conversation.
- **Task breakdown:** [tasks.md](tasks.md), approved by the human owner.
- **Implementation:** Paused until the owner asks to proceed.
- Test changes require approved `spec.md`, `plan.md`, and `tasks.md`.

## 2. Context and evidence

### Observed

- `packages/jira-integration/test/index.test.ts` registers the real extension
  with a fake Pi host. Its connected read test covers `jira_search`.
- `test/description-interface.test.ts` checks both `jira_view` modes with fake
  use cases. `test/description-cli.test.ts` checks complete reads through the
  Jira adapter. These tests do not exercise both modes through the registered
  tool and connected extension together.
- `src/interface/pi/register-jira-tools.ts` sends a normal read to `view` and
  a complete read to `viewDocument`. `src/infrastructure/jira-cli-adapter.ts`
  performs the associated ACLI reads. The complete read checks the active
  account and site and distinguishes a missing description from `null`.
- No test command has been run for this plan. No production defect has been
  established. The new tests are expected to pass on the current code, but
  that result is not yet verified.

### Context and decisions

Read `GLOSSARY-MAP.md`, root `GLOSSARY.md`, the Jira package glossary and
README, `CONTRIBUTING.md`, and `docs/agents/domain.md`. Keep ADR-0002's ACLI
access method, ADR-0005's module rules, and ADR-0010's complete-read and
approved-update safeguards. No decision or public contract needs to change.

JIRA-003 has an approved spec and plan, but its task list is not approved.
These read tests do not change or depend on its replacement validation work.

## 3. Technical approach and boundaries

Extend `packages/jira-integration/test/index.test.ts`. Register the real Jira
extension with its existing fake Pi host. Call the registered `jira_view` tool
with each mode and supply fake `pi.exec` results for ACLI commands. Do not
replace the application use cases or the Jira adapter in these tests.

Use small, explicit issue fixtures and fake authentication output:

1. Normal read: authentication succeeds without account or site details. Return
   an issue with a text description. Check the result details and tool text.
2. Complete read: return a successful authentication check, an active-account
   response with one site and email, and an issue with a small structured
   description. Check the full document and the existing text description.
3. Unknown account: return successful authentication status without a usable
   site or email for the active-account check. Check the tool reports an error.
4. Missing description: return a valid active account and an issue whose fields
   omit `description`. Check the tool reports an error, not a null document.
5. Cancellation: pass an already-aborted signal to the registered read tool.
   Check that the call does not succeed and that no fake ACLI command runs.
   Confirm no write command is requested in these tests.

Keep the fake command runner strict: accept only the expected read and
successful authentication commands, and fail on unexpected commands. Clear or
stub the Jira credential environment variables for these tests and restore
those variables afterward. An unexpected authentication failure must not
start a real login process. Use short outputs so the complete-read test does
not create a temporary output file. Do not contact Jira.

This scope changes tests only. Domain, application, infrastructure, and Pi
production modules remain unchanged. No dependency, configuration, migration,
new tool, or public export is needed.

## 4. Affected files

| Path | Planned change | Requirement |
| --- | --- | --- |
| `packages/jira-integration/test/index.test.ts` | Add connected `jira_view` tests using the real extension and fake ACLI results. | FR-001–FR-006 |
| `specs/jira-integration/004-verify-issue-reads/tasks.md` | Record actual check results after task approval. | FR-007 and delivery rules |

Do not change production source or generated output. If a test exposes a
mismatch, stop and report it rather than changing the approved scope.

## 5. Documentation and release impact

| Artifact | Impact |
| --- | --- |
| Jira README, glossary, and public contract documentation | No update. Behavior and terms do not change. |
| Root glossary, glossary map, and repository rules | No update. Context relationships and rules do not change. |
| ADRs | No update. Accepted decisions remain in force. |
| Changeset | None. The tests are not in the published package files, and package behavior and contents do not change. |
| Dependencies and lockfile | No changes. |

## 6. Verification strategy and acceptance gates

| Spec criterion | Test or check | Required result |
| --- | --- | --- |
| 1 | Normal read with successful authentication but no account or site details. | Existing issue details and text are returned; no complete document is included. |
| 2 | Complete read with a valid active account and a structured description. | Text and the unchanged complete document are returned. |
| 3 | Complete read with an unidentifiable account or site. | The call reports an error. |
| 4 | Complete read with no stored description field. | The call reports an error, not a known empty value. |
| 5 | Already-aborted signal at the tool entry point. | The call does not succeed; the fake command record contains no write and no command starts. |
| 6 | Strict fake runner, isolated credentials, and diff review. | No real Jira access or production source change. |
| 7 | Record approvals before editing tests; record actual checks afterward. | Results distinguish passed, failed, and unrun checks. |

The tests describe existing behavior. They are not a reproduction of a known
bug, so an initial failing test is not required. Run the focused test as each
case is added. If a case fails unexpectedly, stop and investigate without
changing production code.

After implementation, run from the repository root:

```bash
npm test -- --run packages/jira-integration/test/index.test.ts
npm test -- --run packages/jira-integration/test
npm run typecheck
npm run build
npm test
git diff --check
```

Record each actual result in `tasks.md`. No live Jira or manual provider test
is needed. No planned check is evidence of a passing result.

## 7. Work sequence, risks, and open points

After all three approval gates:

1. Add connected tests for normal and complete reads, one case at a time.
2. Add the account, missing-description, and cancellation cases.
3. Run the final checks and review the diff. Decide separately whether a
   production refactor is justified; this plan does not authorize one.

| Risk | Check |
| --- | --- |
| A fake authentication failure starts real login. | Use successful fake status responses, isolate credential variables, and reject unexpected commands. |
| Tests pass by checking fake results rather than tool behavior. | Assert the registered tool's returned details, text, and errors. |
| Missing content is confused with a known empty value. | Omit the description field and assert an error. |
| Untracked files are missed by `git diff --check`. | Inspect `git status` and check new files separately during the final review. |

No dependency installation, configuration change, or irreversible action is
needed. If a safeguard or the approved scope blocks the work, stop and ask the
owner instead of adding a workaround.

## 8. Delivery and approval checkpoint

- **Proposed branch:** `test/verify-jira-issue-reads`
- **Proposed commit subject:** `✅ test(jira-integration): verify issue reads`
- **Pull request title:** `✅ test(jira-integration): verify issue reads`
- **Pull request summary:** Cover normal and complete issue reads through the
  registered tool with fake ACLI access. Report the verification results.
- **Existing work to preserve:** The approved `spec.md` in this directory.
- **Owner decision needed:** Ask to proceed before test changes start.

Plan approval does not authorize test changes, a branch, a commit, a pull
request, or publication. Test changes still require an approved task list.
