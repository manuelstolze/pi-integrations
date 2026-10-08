export interface JiraCommandResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

export interface JiraCommandOptions {
  signal?: AbortSignal;
  timeoutMs: number;
}

export type JiraCommandRunner = (
  args: string[],
  options: JiraCommandOptions,
) => Promise<JiraCommandResult>;

export interface JiraLoginCredentials {
  site: string;
  email: string;
  token: string;
}

export type JiraLoginRunner = (
  credentials: JiraLoginCredentials,
  options: JiraCommandOptions,
) => Promise<JiraCommandResult>;

export interface JiraClientOptions {
  runCommand: JiraCommandRunner;
  login: JiraLoginRunner;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
