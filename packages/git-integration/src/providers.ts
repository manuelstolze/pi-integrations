import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { providerCli, requestHead } from "./remote.js";
import type { ExistingRequest, ProviderKind, RemoteInfo } from "./types.js";

export interface RequestPlanInput {
  provider: ProviderKind;
  host: string;
  targetRepository: string;
  sourceRepository: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  bodyFile: string;
}

function cliArgs(provider: ProviderKind, host: string, args: string[]): string[] {
  return provider === "github" ? args : ["--hostname", host, ...args];
}

function hostedRepository(provider: ProviderKind, host: string, repository: string): string {
  return provider === "github" ? `${host}/${repository}` : repository;
}

export function authCheckArgs(_provider: ProviderKind, host: string): string[] {
  return ["auth", "status", "--hostname", host];
}

export function repositoryCheckArgs(provider: ProviderKind, host: string, repository: string): string[] {
  return provider === "github"
    ? ["repo", "view", hostedRepository(provider, host, repository), "--json", "name"]
    : ["--hostname", host, "repo", "view", repository, "--output", "json"];
}

export function listRequestArgs(
  provider: ProviderKind,
  host: string,
  targetRepository: string,
  sourceBranch: string,
  targetBranch: string,
  sourceRepository?: string,
): string[] {
  if (provider === "github") {
    return cliArgs(provider, host, [
      "pr",
      "list",
      "--repo",
      hostedRepository(provider, host, targetRepository),
      "--head",
      sourceRepository && sourceRepository !== targetRepository
        ? `${sourceRepository.split("/")[0]}:${sourceBranch}`
        : sourceBranch,
      "--base",
      targetBranch,
      "--state",
      "all",
      "--limit",
      "50",
      "--json",
      "number,title,state,url,headRefName,baseRefName,mergedAt",
    ]);
  }
  return cliArgs(provider, host, [
    "mr",
    "list",
    "--repo",
    hostedRepository(provider, host, targetRepository),
    "--source-branch",
    sourceBranch,
    "--target-branch",
    targetBranch,
    "--state",
    "all",
    "--output",
    "json",
  ]);
}

export function createRequestArgs(input: RequestPlanInput): string[] {
  if (input.provider === "github") {
    return cliArgs(input.provider, input.host, [
      "pr",
      "create",
      "--repo",
      hostedRepository(input.provider, input.host, input.targetRepository),
      "--head",
      requestHead(
        { name: input.sourceRepository === input.targetRepository ? "origin" : "source", repository: input.sourceRepository } as RemoteInfo,
        input.sourceBranch,
        input.provider,
      ),
      "--base",
      input.targetBranch,
      "--title",
      input.title,
      "--body-file",
      input.bodyFile,
    ]);
  }
  return cliArgs(input.provider, input.host, [
    "mr",
    "create",
    "--repo",
    hostedRepository(input.provider, input.host, input.targetRepository),
    "--head",
    input.sourceRepository,
    "--source-branch",
    input.sourceBranch,
    "--target-branch",
    input.targetBranch,
    "--title",
    input.title,
    "--description-file",
    input.bodyFile,
    "--yes",
  ]);
}

export function updateRequestArgs(
  input: RequestPlanInput,
  requestId: string,
): string[] {
  if (input.provider === "github") {
    return cliArgs(input.provider, input.host, [
      "pr",
      "edit",
      requestId,
      "--repo",
      hostedRepository(input.provider, input.host, input.targetRepository),
      "--title",
      input.title,
      "--body-file",
      input.bodyFile,
    ]);
  }
  return cliArgs(input.provider, input.host, [
    "mr",
    "update",
    requestId,
    "--repo",
    hostedRepository(input.provider, input.host, input.targetRepository),
    "--title",
    input.title,
    "--description-file",
    input.bodyFile,
    "--yes",
  ]);
}

export async function checkProvider(
  pi: ExtensionAPI,
  provider: ProviderKind,
  host: string,
  repository: string,
): Promise<void> {
  const cli = providerCli(provider);
  const auth = await pi.exec(cli, authCheckArgs(provider, host), { timeout: 15_000 });
  if (auth.code !== 0) {
    throw new Error(`${cli} is not authenticated for ${host}. Run '${cli} auth login'.`);
  }
  const repositoryResult = await pi.exec(cli, repositoryCheckArgs(provider, host, repository), { timeout: 15_000 });
  if (repositoryResult.code !== 0) {
    throw new Error(`${cli} cannot access ${host}/${repository}.`);
  }
}

export async function listExistingRequests(
  pi: ExtensionAPI,
  provider: ProviderKind,
  host: string,
  targetRepository: string,
  sourceBranch: string,
  targetBranch: string,
  sourceRepository?: string,
): Promise<ExistingRequest[]> {
  const cli = providerCli(provider);
  const result = await pi.exec(
    cli,
    listRequestArgs(provider, host, targetRepository, sourceBranch, targetBranch, sourceRepository),
    { timeout: 20_000 },
  );
  if (result.code !== 0 || !result.stdout) return [];

  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeRequest(provider, item, sourceBranch, targetBranch)).filter(Boolean) as ExistingRequest[];
  } catch {
    return [];
  }
}

function normalizeRequest(
  provider: ProviderKind,
  value: unknown,
  sourceBranch: string,
  targetBranch: string,
): ExistingRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const id = String(item.number ?? item.iid ?? item.id ?? "");
  const title = String(item.title ?? "");
  const url = String(item.url ?? item.web_url ?? "");
  const rawState = String(item.state ?? "").toLowerCase();
  const merged = item.mergedAt || rawState === "merged";
  const state: ExistingRequest["state"] = merged
    ? "merged"
    : rawState === "open" || rawState === "opened" ? "open"
      : rawState === "closed" ? "closed"
        : "unknown";
  if (!id || !url) return undefined;
  return { id, title, state, url, sourceBranch, targetBranch };
}
