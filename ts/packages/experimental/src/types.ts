import type { Session, ToolRouterCreateSessionConfig } from '@composio/core';

export type SandboxProviderName = 'e2b' | 'modal' | 'daytona' | (string & {});

export interface SandboxProvisionContext {
  sessionId: string;
  backendUrl: string;
  apiKey?: string;
  env?: Record<string, string | undefined>;
}

export interface SandboxExecutionOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  text?: string;
  json?: unknown;
  raw?: unknown;
}

export interface SandboxProvider<THandle = unknown> {
  readonly provider: SandboxProviderName;
  provision(ctx: SandboxProvisionContext): Promise<THandle>;
  exec(
    handle: THandle,
    code: string,
    opts?: SandboxExecutionOptions
  ): Promise<SandboxExecutionResult>;
  runBash(
    handle: THandle,
    cmd: string,
    opts?: SandboxExecutionOptions
  ): Promise<SandboxExecutionResult>;
  writeFile(handle: THandle, path: string, content: string): Promise<void>;
  teardown(handle: THandle): Promise<void>;
}

export type LocalWorkbenchConfig = Omit<ToolRouterCreateSessionConfig, 'workbench'> & {
  workbench: NonNullable<ToolRouterCreateSessionConfig['workbench']> & {
    experimentalProvider: SandboxProvider;
  };
};

export interface LocalWorkbenchSession<THandle = unknown> {
  session: Session<unknown, unknown, never>;
  provider: SandboxProvider<THandle>;
  sandbox: THandle;
  teardown(): Promise<void>;
}
