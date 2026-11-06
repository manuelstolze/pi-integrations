import { describe, expect, it, vi } from "vitest";
import type { GitRepositoryPort, RepositorySnapshot } from "../src/application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../src/application/ports/hosting-provider-port.js";
import { prepareHeraldRun } from "../src/application/use-cases/prepare-herald-run.js";
import {
  checkStageCommandInput, prepareStageProposal,
} from "../src/application/use-cases/prepare-stage-proposal.js";
import type {
  CommitInputCheckPort, CommitStageDraft, PreparedCommitStageProposal,
  PreparedRequestStageProposal, RequestInputCheckPort, RequestStageDraft,
} from "../src/application/ports/stage-input-check-ports.js";

const snapshot: RepositorySnapshot = {
  branch: "feature/example",
  status: " M src/example.ts",
  stagedDiff: "",
  unstagedDiff: "diff --git a/src/example.ts b/src/example.ts",
  recentCommits: "abc123 Add example",
};

const commitDraft: CommitStageDraft = {
  stage: "commit",
  commits: [{ message: "Add example", files: ["src/example.ts"] }],
};
const requestDraft: RequestStageDraft = {
  stage: "request",
  provider: "github",
  sourceBranch: "feature/example",
  targetBranch: "main",
  title: "Add example",
  description: "Review the example change.",
  descriptionInput: { kind: "inline" },
  pushAlreadyCompleted: false,
};

const preparedCommit: PreparedCommitStageProposal = {
  stage: "commit",
  commits: [{
    message: "Add example", files: ["src/example.ts"],
    command: "git commit -m 'Add example'", inputSnapshot: "commit-snapshot-1",
  }],
};
const preparedRequest: PreparedRequestStageProposal = {
  ...requestDraft,
  commands: [
    { action: "push", command: "git push origin feature/example:feature/example", inputSnapshot: "push-snapshot" },
    { action: "create", command: "gh pr create --base main --head feature/example", inputSnapshot: "request-snapshot" },
  ],
};

function fakeCommitChecks(overrides: Partial<CommitInputCheckPort> = {}) {
  const prepare = vi.fn(async () => ({ ok: true as const, proposal: preparedCommit }));
  const verify = vi.fn(async () => ({ ok: true as const }));
  return { port: { prepare, verify, ...overrides }, prepare, verify };
}

function fakeRequestChecks(overrides: Partial<RequestInputCheckPort> = {}) {
  const prepare = vi.fn(async (draft: RequestStageDraft) => ({
    ok: true as const,
    proposal: draft.pushAlreadyCompleted
      ? { ...preparedRequest, ...draft, pushAlreadyCompleted: true, commands: [preparedRequest.commands[1]] }
      : { ...preparedRequest, ...draft, pushAlreadyCompleted: false },
  }));
  const verify = vi.fn(async () => ({ ok: true as const }));
  return { port: { prepare, verify, ...overrides }, prepare, verify };
}

function fakeGit(overrides: Partial<GitRepositoryPort> = {}): GitRepositoryPort {
  return {
    isRepository: async () => true,
    originUrl: async () => "git@gitlab.example.com:group/repo.git",
    snapshot: async () => snapshot,
    refExists: async (ref) => ref === "origin/develop",
    diffAgainst: async (ref) => `diff against ${ref}`,
    ...overrides,
  };
}

function fakeHosting(overrides: Partial<HostingProviderPort> = {}): HostingProviderPort {
  return {
    resolve: async (_origin, hint) => hint ?? "gitlab",
    defaultBranch: async () => "main",
    ...overrides,
  };
}

describe("prepareHeraldRun", () => {
  it("prepares commit mode without resolving a hosting provider", async () => {
    const originUrl = vi.fn(async () => { throw new Error("origin should not be used"); });
    const resolve = vi.fn(async () => { throw new Error("hosting should not be used"); });
    const defaultBranch = vi.fn(async () => { throw new Error("hosting should not be used"); });
    const hosting = fakeHosting({ resolve, defaultBranch });

    await expect(prepareHeraldRun({ mode: "commit", git: fakeGit({ originUrl }), hosting })).resolves.toEqual({
      mode: "commit",
      provider: null,
      snapshot,
    });
    expect(originUrl).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(defaultBranch).not.toHaveBeenCalled();
  });

  it("prepares a full GitLab run with a resolved provider", async () => {
    await expect(prepareHeraldRun({ mode: "full", git: fakeGit(), hosting: fakeHosting() })).resolves.toEqual({
      mode: "full",
      provider: "gitlab",
      snapshot,
    });
  });

  it("prepares full mode with empty history after hosting validation", async () => {
    const emptyHistory = { ...snapshot, recentCommits: "" };
    const resolve = vi.fn(async () => "gitlab" as const);
    const collect = vi.fn(async () => {
      expect(resolve).toHaveBeenCalledOnce();
      return emptyHistory;
    });

    await expect(prepareHeraldRun({
      mode: "full",
      git: fakeGit({ snapshot: collect }),
      hosting: fakeHosting({ resolve }),
    })).resolves.toEqual({ mode: "full", provider: "gitlab", snapshot: emptyHistory });
    expect(collect).toHaveBeenCalledOnce();
  });

  it.each(["full", "request"] as const)("stops %s before context collection without an origin", async (mode) => {
    const collect = vi.fn(async () => snapshot);
    const resolve = vi.fn(async () => "gitlab" as const);

    await expect(prepareHeraldRun({
      mode,
      git: fakeGit({ originUrl: async () => null, snapshot: collect }),
      hosting: fakeHosting({ resolve }),
    })).rejects.toMatchObject({ code: "missing-origin" });
    expect(collect).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(["full", "request"] as const)("stops %s before context collection when hosting fails", async (mode) => {
    const collect = vi.fn(async () => snapshot);

    await expect(prepareHeraldRun({
      mode,
      git: fakeGit({ snapshot: collect }),
      hosting: fakeHosting({ resolve: async () => { throw new Error("Hosting access failed"); } }),
    })).rejects.toMatchObject({ code: "provider-unavailable", message: "Hosting access failed" });
    expect(collect).not.toHaveBeenCalled();
  });

  it.each([
    [[], null],
    [["master"], "master"],
    [["main"], "main"],
    [["main", "master"], "main"],
    [["develop"], "develop"],
    [["develop", "master"], "develop"],
    [["develop", "main"], "develop"],
    [["develop", "main", "master"], "develop"],
  ])("prepares the first available GitLab target from %o", async (available, target) => {
    const refExists = vi.fn(async (ref: string) => available.some((branch) => ref === `origin/${branch}`));
    const diffAgainst = vi.fn(async (ref: string) => `diff against ${ref}`);
    const result = await prepareHeraldRun({
      mode: "request",
      git: fakeGit({ refExists, diffAgainst }),
      hosting: fakeHosting(),
    });

    expect(refExists.mock.calls.map(([ref]) => ref)).toEqual(["origin/develop", "origin/main", "origin/master"]);
    expect(result).toEqual({
      mode: "request",
      provider: "gitlab",
      snapshot,
      targetBranch: target,
      diff: target
        ? { kind: "available", baseRef: `origin/${target}`, text: `diff against origin/${target}` }
        : { kind: "no-target" },
    });
    if (target) {
      expect(diffAgainst).toHaveBeenCalledExactlyOnceWith(`origin/${target}`);
    } else {
      expect(diffAgainst).not.toHaveBeenCalled();
    }
  });

  it("starts every GitLab branch check before any check completes", async () => {
    const releases: Array<(value: boolean) => void> = [];
    const refExists = vi.fn((_ref: string) => new Promise<boolean>((resolve) => releases.push(resolve)));
    const run = prepareHeraldRun({ mode: "request", git: fakeGit({ refExists }), hosting: fakeHosting() });

    try {
      await vi.waitFor(() => expect(refExists).toHaveBeenCalledTimes(3));
      expect(refExists.mock.calls.map(([ref]) => ref)).toEqual(["origin/develop", "origin/main", "origin/master"]);
    } finally {
      // A sequential implementation can start its next check only after the previous release.
      // Resolve future checks too, so the run cannot remain pending after a failed assertion.
      refExists.mockImplementation(async () => false);
      for (const release of releases) release(false);
      await run;
    }
  });

  it("propagates a failed GitLab branch check", async () => {
    const failure = new Error("branch check failed");
    const refExists = vi.fn(async (ref: string) => {
      if (ref === "origin/main") throw failure;
      return false;
    });
    const diffAgainst = vi.fn(async () => "diff");
    await expect(prepareHeraldRun({
      mode: "request",
      git: fakeGit({ refExists, diffAgainst }),
      hosting: fakeHosting(),
    })).rejects.toBe(failure);
    expect(refExists.mock.calls.map(([ref]) => ref)).toEqual(["origin/develop", "origin/main", "origin/master"]);
    expect(diffAgainst).not.toHaveBeenCalled();
  });

  it("uses the GitHub default branch for request mode", async () => {
    const refExists = vi.fn(async () => false);
    const diffAgainst = vi.fn(async (ref: string) => `diff against ${ref}`);
    const git = fakeGit({
      originUrl: async () => "https://github.com/owner/repo.git",
      refExists,
      diffAgainst,
    });
    const defaultBranch = vi.fn(async () => "trunk");
    const hosting = fakeHosting({
      resolve: async (_origin, hint) => hint ?? "gitlab",
      defaultBranch,
    });

    await expect(prepareHeraldRun({ mode: "request", git, hosting })).resolves.toMatchObject({
      mode: "request",
      provider: "github",
      targetBranch: "trunk",
      diff: {
        kind: "available",
        baseRef: "origin/trunk",
      },
    });
    expect(defaultBranch).toHaveBeenCalledExactlyOnceWith("github");
    expect(refExists).not.toHaveBeenCalled();
    expect(diffAgainst).toHaveBeenCalledExactlyOnceWith("origin/trunk");
  });

  it("reports a missing origin before provider resolution", async () => {
    const hosting = fakeHosting({
      resolve: async () => {
        throw new Error("provider should not be called");
      },
    });

    await expect(
      prepareHeraldRun({
        mode: "request",
        git: fakeGit({ originUrl: async () => null }),
        hosting,
      }),
    ).rejects.toMatchObject({
      code: "missing-origin",
      message: "No usable origin remote found. Configure a GitHub or GitLab origin remote first.",
    });
  });

  it("reports a repository check failure as a typed application error", async () => {
    await expect(
      prepareHeraldRun({ mode: "full", git: fakeGit({ isRepository: async () => false }), hosting: fakeHosting() }),
    ).rejects.toMatchObject({
      code: "not-repository",
      message: "Not a git repository.",
    });
  });
});

describe("prepareStageProposal", () => {
  it("prepares explicit commit proposals and checks the exact approved command", async () => {
    const checks = fakeCommitChecks();
    const result = await prepareStageProposal({ mode: "full", draft: commitDraft, inputChecks: checks.port });
    expect(result).toEqual({ ok: true, proposal: preparedCommit });
    if (!result.ok) throw new Error("Expected a prepared commit proposal");

    await expect(checkStageCommandInput({
      mode: "full", proposal: result.proposal, commandIndex: 0,
      command: "git commit -m 'Add example'", inputChecks: checks.port,
    })).resolves.toEqual({ allowed: true });
    expect(checks.verify).toHaveBeenCalledExactlyOnceWith(preparedCommit, 0);
    await expect(checkStageCommandInput({
      mode: "full", proposal: result.proposal, commandIndex: 0,
      command: "git commit -m altered", inputChecks: checks.port,
    })).resolves.toMatchObject({ allowed: false, reason: "The command does not match the proposal." });
    expect(checks.verify).toHaveBeenCalledOnce();
  });

  it("prepares the ordered push and request commands for a review request", async () => {
    const checks = fakeRequestChecks();
    const result = await prepareStageProposal({ mode: "request", draft: requestDraft, inputChecks: checks.port });
    expect(result).toEqual({ ok: true, proposal: preparedRequest });
    if (!result.ok || result.proposal.stage !== "request") throw new Error("Expected a prepared request proposal");

    await expect(checkStageCommandInput({
      mode: "request", proposal: result.proposal, commandIndex: 0,
      command: preparedRequest.commands[0].command, inputChecks: checks.port,
    })).resolves.toEqual({ allowed: true });
    await expect(checkStageCommandInput({
      mode: "full", proposal: result.proposal, commandIndex: 1,
      command: preparedRequest.commands[1].command, inputChecks: checks.port,
    })).resolves.toEqual({ allowed: true });
    expect(checks.verify).toHaveBeenNthCalledWith(1, preparedRequest, "push");
    expect(checks.verify).toHaveBeenNthCalledWith(2, preparedRequest, "create");
  });

  it("rejects incomplete proposals and adapter results that cannot be checked", async () => {
    const commits = fakeCommitChecks();
    const missingCommit = await prepareStageProposal({
      mode: "commit", draft: { stage: "commit", commits: [{ message: " ", files: [] }] },
      inputChecks: commits.port,
    });
    expect(missingCommit).toMatchObject({ ok: false, kind: "invalid-proposal" });
    expect(commits.prepare).not.toHaveBeenCalled();

    const requestChecks = fakeRequestChecks();
    const missingBranch = await prepareStageProposal({
      mode: "full", draft: { ...requestDraft, targetBranch: " " }, inputChecks: requestChecks.port,
    });
    expect(missingBranch).toMatchObject({ ok: false, kind: "invalid-proposal" });
    expect(requestChecks.prepare).not.toHaveBeenCalled();

    const missingSnapshot = fakeCommitChecks({
      prepare: async () => ({
        ok: true,
        proposal: { ...preparedCommit, commits: [{ ...preparedCommit.commits[0], inputSnapshot: " " }] },
      }),
    });
    await expect(prepareStageProposal({ mode: "commit", draft: commitDraft, inputChecks: missingSnapshot.port }))
      .resolves.toMatchObject({ ok: false, kind: "invalid-proposal" });
  });

  it("enforces mode limits before calling either capability port", async () => {
    const commitChecks = fakeCommitChecks();
    const requestChecks = fakeRequestChecks();
    await expect(prepareStageProposal({ mode: "request", draft: commitDraft, inputChecks: commitChecks.port }))
      .resolves.toMatchObject({ ok: false, kind: "mode-disallowed" });
    await expect(prepareStageProposal({ mode: "commit", draft: requestDraft, inputChecks: requestChecks.port }))
      .resolves.toMatchObject({ ok: false, kind: "mode-disallowed" });
    expect(commitChecks.prepare).not.toHaveBeenCalled();
    expect(requestChecks.prepare).not.toHaveBeenCalled();
  });

  it("fails closed when prepare or execution-time input checks fail", async () => {
    const prepareFailure = await prepareStageProposal({
      mode: "commit",
      draft: commitDraft,
      inputChecks: fakeCommitChecks({
        prepare: async () => ({ ok: false, reason: "The commit input cannot be checked." }),
      }).port,
    });
    expect(prepareFailure).toMatchObject({ ok: false, kind: "input-unverifiable" });

    const failedCheck = await checkStageCommandInput({
      mode: "full", proposal: preparedCommit, commandIndex: 0,
      command: preparedCommit.commits[0].command,
      inputChecks: fakeCommitChecks({
        verify: async () => ({ ok: false, reason: "The working tree changed." }),
      }).port,
    });
    expect(failedCheck).toEqual({ allowed: false, reason: "The working tree changed." });

    const failedRequestCheck = await checkStageCommandInput({
      mode: "request", proposal: preparedRequest, commandIndex: 1,
      command: preparedRequest.commands[1].command,
      inputChecks: fakeRequestChecks({ verify: async () => { throw new Error("Description changed."); } }).port,
    });
    expect(failedRequestCheck).toEqual({ allowed: false, reason: "Description changed." });
  });
});
