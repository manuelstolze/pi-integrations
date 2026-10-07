export const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ProcessExecutionOptions {
  cwd: string;
  timeout: number;
}

export type ProcessExecutor = (
  command: string,
  args: string[],
  options: ProcessExecutionOptions,
) => Promise<ProcessResult>;

export interface ProcessRunner {
  run(command: string, args: string[]): Promise<ProcessResult>;
}

export class ExecProcessRunner implements ProcessRunner {
  constructor(
    private readonly exec: ProcessExecutor,
    private readonly cwd: string,
  ) {}

  async run(command: string, args: string[]): Promise<ProcessResult> {
    try {
      const result = await this.exec(command, args, {
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
