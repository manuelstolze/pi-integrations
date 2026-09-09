import type { HostingProvider } from "../../domain/hosting-provider.js";

export interface HostingProviderPort {
  resolve(originUrl: string, hint: HostingProvider | null): Promise<HostingProvider>;
  defaultBranch(provider: HostingProvider): Promise<string | null>;
}
