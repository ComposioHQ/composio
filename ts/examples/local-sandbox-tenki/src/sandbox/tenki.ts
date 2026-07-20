import {
  isReady,
  isTerminal,
  stderrText,
  stdoutText,
  TenkiSandbox,
  type Session,
} from '@tenkicloud/sandbox';

/**
 * Tenki implementation of the local-sandbox contract.
 *
 * The interfaces below (`SandboxOptions`, `UserSandbox`, `RunOptions`) mirror
 * the canonical sandbox adapter from Composio's local-sandbox example, so this
 * file is swappable with any other runner that honors the same contract. Tenki
 * specifics never leak past this module.
 */
export interface SandboxOptions {
  apiKey: string;
  /** Budget for session creation + readiness. A boot that exceeds it is terminated. */
  timeoutMs: number;
  /**
   * Hard backstop: the microVM self-terminates after this duration even if the
   * host process crashes or is SIGKILLed before `teardown()` runs.
   */
  maxDurationMs: number;
  remoteDir: string;
  helperSource: string;
  env: Record<string, string>;
  /** Optional pins; default to the first workspace/project visible to the API key. */
  workspaceId?: string;
  projectId?: string;
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

export function shellQuote(value: string): string {
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

export async function createTenkiSandbox(options: SandboxOptions): Promise<UserSandbox> {
  const tenki = new TenkiSandbox({ authToken: options.apiKey });

  // Session creation requires a project; resolve one from the key's identity.
  // Pinned ids must match exactly — a mistyped id fails loudly instead of
  // silently booting the microVM in whatever workspace/project comes first.
  const identity = await tenki.whoAmI();
  const workspace = options.workspaceId
    ? identity.workspaces.find(ws => ws.id === options.workspaceId)
    : identity.workspaces[0];
  if (!workspace) {
    throw new Error(
      options.workspaceId
        ? `Tenki workspace ${options.workspaceId} not visible to this API key ` +
            `(visible: ${identity.workspaces.map(ws => ws.id).join(', ') || 'none'})`
        : 'No Tenki workspace visible to this API key'
    );
  }
  const project = options.projectId
    ? workspace.projects.find(p => p.id === options.projectId)
    : workspace.projects[0];
  if (!project) {
    throw new Error(
      options.projectId
        ? `Tenki project ${options.projectId} not found in workspace "${workspace.name}" ` +
            `(visible: ${workspace.projects.map(p => p.id).join(', ') || 'none'})`
        : `No Tenki project visible in workspace "${workspace.name}"`
    );
  }

  // Failure-atomic boot: take the session handle *before* waiting for
  // readiness, so a failed or timed-out boot can still be terminated instead
  // of leaking a running microVM. `maxDurationMs` covers the host-crash case.
  const session = await tenki.create({
    name: 'composio-local-sandbox',
    workspaceId: workspace.id,
    projectId: project.id,
    allowOutbound: true, // the Composio helper calls the Tool Router from inside the guest
    maxDurationMs: options.maxDurationMs,
    waitReady: false,
  });

  try {
    await waitUntilReady(session, options.timeoutMs);
    await exec(session, `mkdir -p ${shellQuote(options.remoteDir)}`, { timeoutMs: 30_000 });
    await session.writeFile(`${options.remoteDir}/composio_helper.py`, options.helperSource);
  } catch (error) {
    // Best-effort cleanup; never mask the original boot error.
    await session.closeIfOpen().catch(() => {});
    throw error;
  }

  return {
    remoteDir: options.remoteDir,
    env: options.env,
    async writeFile(path, contents) {
      await session.writeFile(path, contents);
    },
    async run(command, runOptions = {}) {
      await exec(session, command, runOptions);
    },
    async teardown() {
      await session.closeIfOpen();
    },
  };
}

/**
 * Poll until the session accepts commands, using unary calls only.
 * (`session.waitReady()` uses a server-streaming RPC that Bun's node:http2
 * implementation closes prematurely; polling `refresh()` is runtime-agnostic.)
 */
async function waitUntilReady(session: Session, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await session.refresh();
    if (isReady(session.state)) return;
    if (isTerminal(session.state)) {
      throw new Error(`session entered terminal state ${session.state} while booting`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`session not ready after ${timeoutMs}ms (state: ${session.state})`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function exec(session: Session, command: string, runOptions: RunOptions): Promise<void> {
  const result = await session.exec('bash', {
    args: ['-lc', command],
    timeoutMs: runOptions.timeoutMs,
    env: runOptions.env,
    onOutput: output => {
      const text = new TextDecoder().decode(output.data);
      if (output.isStderr) {
        runOptions.onStderr?.(text);
      } else {
        runOptions.onStdout?.(text);
      }
    },
  });

  if (result.exitCode !== 0) {
    // Normalize into the same shape `commandErrorText` understands.
    throw Object.assign(new Error(`command failed: ${command}`), {
      result: {
        exitCode: result.exitCode,
        stdout: stdoutText(result),
        stderr: stderrText(result),
      },
    } satisfies CommandError);
  }
}
