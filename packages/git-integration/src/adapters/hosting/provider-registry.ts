import type { HostingProviderPort } from "../../application/ports/hosting-provider-port.js";
import type { HostingProvider } from "../../domain/hosting-provider.js";
import type { HostingAdapter } from "./hosting-adapter.js";

export class HostingProviderRegistry implements HostingProviderPort {
  private readonly adapters: ReadonlyMap<HostingProvider, HostingAdapter>;

  constructor(adapters: readonly HostingAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  }

  async resolve(_originUrl: string, hint: HostingProvider | null): Promise<HostingProvider> {
    const provider = hint ?? "gitlab";
    const adapter = this.adapterFor(provider);
    await adapter.validateAccess();
    return provider;
  }

  async defaultBranch(provider: HostingProvider): Promise<string | null> {
    return this.adapterFor(provider).defaultBranch();
  }

  private adapterFor(provider: HostingProvider): HostingAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`No hosting adapter is configured for ${provider}.`);
    return adapter;
  }
}
