import { providerHintFromOriginUrl, type HostingProvider } from "../../domain/hosting-provider.js";
import type { GitMode } from "../../domain/git-mode.js";
import { selectGitLabTargetBranch } from "../../domain/rules.js";
import { errorMessage, HeraldError } from "../errors.js";
import type { GitRepositoryPort, RepositorySnapshot } from "../ports/git-repository-port.js";
import type { HostingProviderPort } from "../ports/hosting-provider-port.js";

export type PreparedRequestDiff =
  | { kind: "no-target" }
  | { kind: "available"; baseRef: string; text: string }
  | { kind: "read-error"; baseRef: string; message: string };

export type PreparedHeraldRun =
  | {
      mode: "commit";
      provider: null;
      snapshot: RepositorySnapshot;
    }
  | {
      mode: "full";
      provider: HostingProvider;
      snapshot: RepositorySnapshot;
    }
  | {
      mode: "request";
      provider: HostingProvider;
      snapshot: RepositorySnapshot;
      targetBranch: string | null;
      diff: PreparedRequestDiff;
    };

export interface PrepareHeraldRunInput {
  mode: GitMode;
  git: GitRepositoryPort;
  hosting: HostingProviderPort;
}

export async function prepareHeraldRun(input: PrepareHeraldRunInput): Promise<PreparedHeraldRun> {
  const { git, mode } = input;

  if (!(await git.isRepository())) {
    throw new HeraldError("not-repository", "Not a git repository.");
  }

  let provider: HostingProvider | null = null;
  if (mode !== "commit") {
    const originUrl = await git.originUrl();
    if (!originUrl) {
      throw new HeraldError(
        "missing-origin",
        "No usable origin remote found. Configure a GitHub or GitLab origin remote first.",
      );
    }

    try {
      provider = await input.hosting.resolve(originUrl, providerHintFromOriginUrl(originUrl));
    } catch (error) {
      if (error instanceof HeraldError) throw error;
      throw new HeraldError("provider-unavailable", errorMessage(error), { cause: error });
    }
  }

  let snapshot: RepositorySnapshot;
  try {
    snapshot = await git.snapshot();
  } catch (error) {
    throw new HeraldError(
      "context-failed",
      `Could not collect Git context: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  if (mode === "commit") {
    return { mode, provider: null, snapshot };
  }

  if (!provider) {
    throw new HeraldError("provider-unavailable", "No hosting provider was resolved.");
  }

  if (mode === "full") {
    return { mode, provider, snapshot };
  }

  const target = await selectTargetBranch(provider, git, input.hosting);
  const diff = await prepareRequestDiff(target?.baseRef ?? null, git);

  return {
    mode,
    provider,
    snapshot,
    targetBranch: target?.branch ?? null,
    diff,
  };
}

interface TargetBranch {
  branch: string;
  baseRef: string;
}

async function selectTargetBranch(
  provider: HostingProvider,
  git: GitRepositoryPort,
  hosting: HostingProviderPort,
): Promise<TargetBranch | null> {
  if (provider === "github") {
    const branch = await hosting.defaultBranch(provider);
    return branch ? { branch, baseRef: `origin/${branch}` } : null;
  }

  const [develop, main, master] = await Promise.all([
    git.refExists("origin/develop"),
    git.refExists("origin/main"),
    git.refExists("origin/master"),
  ]);
  const branch = selectGitLabTargetBranch({ develop, main, master });
  return branch ? { branch, baseRef: `origin/${branch}` } : null;
}

async function prepareRequestDiff(
  baseRef: string | null,
  git: GitRepositoryPort,
): Promise<PreparedRequestDiff> {
  if (!baseRef) return { kind: "no-target" };

  try {
    return {
      kind: "available",
      baseRef,
      text: await git.diffAgainst(baseRef),
    };
  } catch (error) {
    return {
      kind: "read-error",
      baseRef,
      message: errorMessage(error),
    };
  }
}
