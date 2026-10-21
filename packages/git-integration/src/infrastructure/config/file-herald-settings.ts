import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HeraldSettingsPort, HeraldSettingsSnapshot } from "../../application/ports/herald-settings-port.js";

export class FileHeraldSettings implements HeraldSettingsPort {
  constructor(private readonly agentDir: string) {}

  async read(input: { cwd: string; projectTrusted: boolean }): Promise<HeraldSettingsSnapshot> {
    const snapshot: HeraldSettingsSnapshot = { sources: [], problems: [] };
    const paths = [join(this.agentDir, "settings.json")];
    if (input.projectTrusted) paths.push(join(input.cwd, ".pi", "settings.json"));
    for (const path of paths) {
      let content: string;
      try {
        content = await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          snapshot.problems.push({ field: "herald", path, reason: "read" });
        }
        continue;
      }
      try {
        snapshot.sources.push({ path, value: JSON.parse(content.replace(/^\uFEFF/, "")) });
      } catch {
        snapshot.problems.push({ field: "herald", path, reason: "json" });
      }
    }
    return snapshot;
  }
}
