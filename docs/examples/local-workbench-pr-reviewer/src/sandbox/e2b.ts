import { Sandbox } from 'e2b';

export interface SandboxOptions {
  apiKey: string;
  timeoutMs: number;
  remoteDir: string;
  helperSource: string;
  env: Record<string, string>;
}

export interface UserSandbox {
  remoteDir: string;
  env: Record<string, string>;
  writeFile(path: string, contents: string): Promise<void>;
  run(command: string, options?: RunOptions): Promise<void>;
  teardown(): Promise<void>;
}

export interface RunOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

type CommandError = {
  result?: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  };
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function commandErrorText(error: unknown): string {
  const result = (error as CommandError).result;
  if (result) {
    const output = result.stderr || result.stdout || '';
    return `exit ${result.exitCode ?? 'unknown'}\n${output.slice(-1200)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function createE2bSandbox(options: SandboxOptions): Promise<UserSandbox> {
  const sandbox = await Sandbox.create({
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
  });

  await sandbox.commands.run(`mkdir -p ${shellQuote(options.remoteDir)}`, {
    timeoutMs: 30_000,
  });
  await sandbox.files.write(`${options.remoteDir}/composio_helper.py`, options.helperSource);

  return {
    remoteDir: options.remoteDir,
    env: options.env,
    async writeFile(path, contents) {
      await sandbox.files.write(path, contents);
    },
    async run(command, runOptions = {}) {
      await sandbox.commands.run(command, {
        timeoutMs: runOptions.timeoutMs,
        envs: runOptions.env,
        onStdout: runOptions.onStdout,
        onStderr: runOptions.onStderr,
      });
    },
    async teardown() {
      await sandbox.kill();
    },
  };
}
