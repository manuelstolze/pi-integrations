import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseRemoteUrl, runGit } from "./git.js";
import type { ProviderKind, RemoteInfo } from "./types.js";

export function detectKnownProvider(host: string): ProviderKind | undefined {
  const normalized = host.toLowerCase();
  if (normalized === "github.com" || normalized === "ghe.com" || normalized.endsWith(".ghe.com")) return "github";
  if (normalized === "gitlab.com") return "gitlab";
  return undefined;
}

export function providerCli(provider: ProviderKind): "gh" | "glab" {
  return provider === "github" ? "gh" : "glab";
}

export function choosePushRemote(remotes: RemoteInfo[], trackedRemote?: string, explicit?: string): RemoteInfo {
  const name = explicit ?? trackedRemote ?? "origin";
  const remote = remotes.find((item) => item.name === name);
  if (!remote) throw new Error(`Push remote '${name}' was not found.`);
  return remote;
}

export function chooseTargetRemote(
  remotes: RemoteInfo[],
  pushRemote: RemoteInfo,
  explicit?: string,
): RemoteInfo {
  if (explicit) {
    const remote = remotes.find((item) => item.name === explicit);
    if (!remote) throw new Error(`Target remote '${explicit}' was not found.`);
    return remote;
  }

  const upstream = remotes.find((item) => item.name === "upstream");
  if (pushRemote.name === "origin" && upstream && upstream.host === pushRemote.host) {
    return upstream;
  }
  return pushRemote;
}

export async function detectProvider(
  pi: ExtensionAPI,
  cwd: string,
  host: string,
  repository: string,
  override?: ProviderKind,
): Promise<ProviderKind> {
  if (override) return override;
  const known = detectKnownProvider(host);
  if (known) return known;

  const candidates: ProviderKind[] = [];
  for (const provider of ["github", "gitlab"] as const) {
    const cli = providerCli(provider);
    const args = provider === "github"
      ? ["repo", "view", `${host}/${repository}`, "--json", "name"]
      : ["--hostname", host, "repo", "view", repository, "--output", "json"];
    const result = await pi.exec(cli, args, { timeout: 10_000 });
    if (result.code === 0) candidates.push(provider);
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error(
    `Could not identify '${host}' as GitHub or GitLab. Use --provider github or --provider gitlab.`,
  );
}

export function repositoryName(remote: RemoteInfo): string {
  return remote.repository.replace(/\.git$/, "");
}

export function normalizeTargetRepository(value: string, fallbackHost: string): { host: string; repository: string } {
  const trimmed = value.trim();
  if (trimmed.includes("://") || /@[^:]+:/.test(trimmed)) return parseRemoteUrl(trimmed);
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0].includes(".")) {
    return { host: parts[0].toLowerCase(), repository: parts.slice(1).join("/") };
  }
  return { host: fallbackHost, repository: trimmed.replace(/^\/+/, "") };
}

export function requestHead(pushRemote: RemoteInfo, branch: string, provider: ProviderKind): string {
  if (pushRemote.name === "origin") return branch;
  if (provider === "github") return `${pushRemote.repository.split("/")[0]}:${branch}`;
  return branch;
}

export async function remoteBranchExists(pi: ExtensionAPI, cwd: string, remote: RemoteInfo, branch: string): Promise<boolean> {
  const result = await runGit(pi, cwd, ["ls-remote", "--heads", remote.name, `refs/heads/${branch}`]);
  return result.code === 0 && result.stdout.length > 0;
}

export async function findTargetBranch(
  pi: ExtensionAPI,
  cwd: string,
  remote: RemoteInfo,
  explicit?: string,
): Promise<string | undefined> {
  if (explicit) return explicit;
  for (const branch of ["develop", "main", "master"]) {
    if (await remoteBranchExists(pi, cwd, remote, branch)) return branch;
  }
  return undefined;
}
