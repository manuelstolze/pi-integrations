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

export interface ProcessRunOptions {
  /** Keep leading/trailing whitespace and NUL separators in machine-readable output. */
  trimOutput?: boolean;
}

export type ProcessExecutor = (
  command: string,
  args: string[],
  options: ProcessExecutionOptions,
) => Promise<ProcessResult>;

export interface ProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

export class ExecProcessRunner implements ProcessRunner {
  constructor(
    private readonly exec: ProcessExecutor,
    private readonly cwd: string,
  ) {}

  async run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    try {
      const result = await this.exec(command, args, {
        cwd: this.cwd,
        timeout: DEFAULT_COMMAND_TIMEOUT_MS,
      });
      const trimOutput = options.trimOutput !== false;
      return {
        stdout: trimOutput ? result.stdout.trim() : result.stdout,
        stderr: trimOutput ? result.stderr.trim() : result.stderr,
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
