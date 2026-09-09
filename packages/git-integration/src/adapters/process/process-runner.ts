import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ProcessRunner {
  run(command: string, args: string[]): Promise<ProcessResult>;
}

export class PiProcessRunner implements ProcessRunner {
  constructor(
    private readonly pi: ExtensionAPI,
    private readonly cwd: string,
  ) {}

  async run(command: string, args: string[]): Promise<ProcessResult> {
    try {
      const result = await this.pi.exec(command, args, {
        cwd: this.cwd,
        timeout: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      return {
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        code: result.code,
      };
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        code: -1,
      };
    }
  }
}
