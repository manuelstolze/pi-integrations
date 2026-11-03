import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export class DescriptionFiles {
  private outputs = new Set<string>();

  async create(value: unknown): Promise<{ path: string; remove(): Promise<void> }> {
    const directory = await mkdtemp(join(tmpdir(), "pi-jira-description-"));
    try {
      await chmod(directory, 0o700);
      const path = join(directory, "document.json");
      await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
      return { path, remove: () => rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async output(value: unknown): Promise<string> {
    const file = await this.create(value);
    this.outputs.add(file.path);
    return file.path;
  }

  async cleanup(): Promise<void> {
    const paths = [...this.outputs];
    const results = await Promise.allSettled(paths.map(async (path) => {
      await rm(dirname(path), { recursive: true, force: true });
      this.outputs.delete(path);
    }));
    if (results.some((r) => r.status === "rejected")) throw new Error("Some private Jira output files could not be removed.");
  }
}
