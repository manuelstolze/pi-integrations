export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type HeraldThinkingLevel = typeof THINKING_LEVELS[number];
export type HeraldField = "herald" | "herald.model" | "herald.thinkingLevel";

export interface SettingsProblem {
  field: HeraldField;
  path: string;
  reason: "invalid" | "read" | "json" | "unknown-model" | "authentication" | "selection" | "unsupported-thinking";
  provider?: string;
  requestedThinking?: HeraldThinkingLevel;
}

export interface HeraldSettingsSource {
  path: string;
  value: unknown;
}

export interface SourcedSetting<T> {
  path: string;
  value?: T;
}

export interface ModelReference {
  provider: string;
  id: string;
}

export interface ResolvedHeraldSettings {
  model?: SourcedSetting<ModelReference>;
  thinkingLevel?: SourcedSetting<HeraldThinkingLevel>;
  problems: SettingsProblem[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveHeraldSettings(sources: readonly HeraldSettingsSource[]): ResolvedHeraldSettings {
  const selected: Partial<Record<"model" | "thinkingLevel", SourcedSetting<unknown>>> = {};
  const problems: SettingsProblem[] = [];
  for (const source of sources) {
    if (!isObject(source.value)) {
      problems.push({ field: "herald", path: source.path, reason: "invalid" });
      continue;
    }
    if (!Object.hasOwn(source.value, "herald")) continue;
    const herald = source.value.herald;
    if (!isObject(herald)) {
      problems.push({ field: "herald", path: source.path, reason: "invalid" });
      selected.model = { path: source.path };
      selected.thinkingLevel = { path: source.path };
      continue;
    }
    for (const field of ["model", "thinkingLevel"] as const) {
      if (Object.hasOwn(herald, field)) selected[field] = { path: source.path, value: herald[field] };
    }
  }

  const resolved: ResolvedHeraldSettings = { problems };
  if (selected.model) {
    const { path, value } = selected.model;
    const slash = typeof value === "string" ? value.indexOf("/") : -1;
    if (typeof value === "string" && slash > 0 && slash < value.length - 1 && !/\s/.test(value)) {
      resolved.model = { path, value: { provider: value.slice(0, slash), id: value.slice(slash + 1) } };
    } else {
      resolved.model = { path };
      if (Object.hasOwn(selected.model, "value")) problems.push({ field: "herald.model", path, reason: "invalid" });
    }
  }
  if (selected.thinkingLevel) {
    const { path, value } = selected.thinkingLevel;
    if (typeof value === "string" && THINKING_LEVELS.includes(value as HeraldThinkingLevel)) {
      resolved.thinkingLevel = { path, value: value as HeraldThinkingLevel };
    } else {
      resolved.thinkingLevel = { path };
      if (Object.hasOwn(selected.thinkingLevel, "value")) problems.push({ field: "herald.thinkingLevel", path, reason: "invalid" });
    }
  }
  return resolved;
}
