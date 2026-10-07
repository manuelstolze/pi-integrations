import type { HostingProvider } from "../../domain/hosting-provider.js";

export interface HostingAdapter {
  readonly provider: HostingProvider;
  validateAccess(): Promise<void>;
  defaultBranch(): Promise<string | null>;
}
