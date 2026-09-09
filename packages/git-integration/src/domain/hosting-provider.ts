export type HostingProvider = "github" | "gitlab";

function remoteHost(remoteUrl: string): string | null {
  const scpMatch = remoteUrl.match(/^[^@]+@([^:]+):/);
  if (scpMatch) return scpMatch[1].toLowerCase();

  try {
    return new URL(remoteUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function providerHintFromOriginUrl(remoteUrl: string): HostingProvider | null {
  return remoteHost(remoteUrl.trim()) === "github.com" ? "github" : null;
}
