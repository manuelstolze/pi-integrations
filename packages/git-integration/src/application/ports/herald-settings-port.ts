import type { HeraldSettingsSource, SettingsProblem } from "../../domain/herald-settings.js";

export interface HeraldSettingsSnapshot {
  sources: HeraldSettingsSource[];
  problems: SettingsProblem[];
}

export interface HeraldSettingsPort {
  read(input: { cwd: string; projectTrusted: boolean }): Promise<HeraldSettingsSnapshot>;
}
