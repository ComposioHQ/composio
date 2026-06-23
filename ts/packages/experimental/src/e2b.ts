import type {
  SandboxExecutionOptions,
  SandboxExecutionResult,
  SandboxProvider,
  SandboxProvisionContext,
} from './types';
import {
  COMPOSIO_WORKBENCH_HELPER_PATH,
  experimental_createWorkbenchEnv,
  experimental_createWorkbenchHelperSource,
} from './shim';

export interface E2BSandboxOptions {
  apiKey?: string;
  template?: string;
  timeoutMs?: number;
  metadata?: Record<string, string>;
}

type E2BHandle = {
  runCode?: (code: string, opts?: unknown) => Promise<unknown>;
  commands?: {
    run?: (cmd: string, opts?: unknown) => Promise<unknown>;
  };
  files?: {
    write?: (path: string, content: string) => Promise<unknown>;
  };
  kill?: () => Promise<unknown>;
};

function compactRecord(record: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function normalizeExecutionResult(raw: unknown): SandboxExecutionResult {
  if (raw && typeof raw === 'object') {
    const result = raw as Record<string, unknown>;
    return {
      stdout: typeof result.stdout === 'string' ? result.stdout : undefined,
      stderr: typeof result.stderr === 'string' ? result.stderr : undefined,
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : undefined,
      text: typeof result.text === 'string' ? result.text : undefined,
      json: result.json,
      raw,
    };
  }
  return { raw };
}

function toE2BOptions(opts?: SandboxExecutionOptions): Record<string, unknown> | undefined {
  if (!opts) {
    return undefined;
  }
  return {
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.env ? { envs: compactRecord(opts.env) } : {}),
  };
}

export function experimental_e2bSandbox(opts: E2BSandboxOptions = {}): SandboxProvider<E2BHandle> {
  return {
    provider: 'e2b',
    async provision(ctx: SandboxProvisionContext): Promise<E2BHandle> {
      const { Sandbox } = await import('@e2b/code-interpreter');
      const envs = experimental_createWorkbenchEnv({
        sessionId: ctx.sessionId,
        backendUrl: ctx.backendUrl,
        apiKey: ctx.apiKey,
      });
      const sandbox = (await Sandbox.create({
        ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
        ...(opts.template ? { template: opts.template } : {}),
        ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.metadata ? { metadata: opts.metadata } : {}),
        envs: {
          ...envs,
          ...compactRecord(ctx.env ?? {}),
        },
      })) as E2BHandle;
      try {
        await this.writeFile(
          sandbox,
          COMPOSIO_WORKBENCH_HELPER_PATH,
          experimental_createWorkbenchHelperSource()
        );
      } catch (error) {
        await this.teardown(sandbox);
        throw error;
      }
      return sandbox;
    },
    async exec(handle: E2BHandle, code: string, execOpts?: SandboxExecutionOptions) {
      if (!handle.runCode) {
        throw new Error('The e2b sandbox handle does not expose runCode().');
      }
      return normalizeExecutionResult(await handle.runCode(code, toE2BOptions(execOpts)));
    },
    async runBash(handle: E2BHandle, cmd: string, execOpts?: SandboxExecutionOptions) {
      if (!handle.commands?.run) {
        throw new Error('The e2b sandbox handle does not expose commands.run().');
      }
      return normalizeExecutionResult(await handle.commands.run(cmd, toE2BOptions(execOpts)));
    },
    async writeFile(handle: E2BHandle, path: string, content: string) {
      if (!handle.files?.write) {
        throw new Error('The e2b sandbox handle does not expose files.write().');
      }
      await handle.files.write(path, content);
    },
    async teardown(handle: E2BHandle) {
      await handle.kill?.();
    },
  };
}
