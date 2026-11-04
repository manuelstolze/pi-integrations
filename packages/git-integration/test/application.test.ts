import { describe, expect, it, vi } from "vitest";
import type { GitRepositoryPort, RepositorySnapshot } from "../src/application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../src/application/ports/hosting-provider-port.js";
import { prepareHeraldRun } from "../src/application/use-cases/prepare-herald-run.js";

const snapshot: RepositorySnapshot = {
  branch: "feature/example",
  status: " M src/example.ts",
  stagedDiff: "",
  unstagedDiff: "diff --git a/src/example.ts b/src/example.ts",
  recentCommits: "abc123 Add example",
};

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
