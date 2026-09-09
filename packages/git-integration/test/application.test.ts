import { describe, expect, it } from "vitest";
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
    const hosting = fakeHosting({
      resolve: async () => {
        throw new Error("hosting should not be used");
      },
    });

    await expect(prepareHeraldRun({ mode: "commit", git: fakeGit(), hosting })).resolves.toEqual({
      mode: "commit",
      provider: null,
      snapshot,
    });
  });

  it("prepares a full GitLab run with a resolved provider", async () => {
    await expect(prepareHeraldRun({ mode: "full", git: fakeGit(), hosting: fakeHosting() })).resolves.toEqual({
      mode: "full",
      provider: "gitlab",
      snapshot,
    });
  });

  it("uses GitLab develop before other fallback branches", async () => {
    await expect(prepareHeraldRun({ mode: "request", git: fakeGit(), hosting: fakeHosting() })).resolves.toEqual({
      mode: "request",
      provider: "gitlab",
      snapshot,
      targetBranch: "develop",
      diff: {
        kind: "available",
        baseRef: "origin/develop",
        text: "diff against origin/develop",
      },
    });
  });

  it("uses the GitHub default branch for request mode", async () => {
    const git = fakeGit({
      originUrl: async () => "https://github.com/owner/repo.git",
      refExists: async () => false,
    });
    const hosting = fakeHosting({
      resolve: async (_origin, hint) => hint ?? "gitlab",
      defaultBranch: async () => "trunk",
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
