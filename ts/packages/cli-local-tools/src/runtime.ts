import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type {
  LocalCommandExecution,
  LocalCommandInvocation,
  LocalExecutionContext,
  LocalExecutionResult,
  LocalFfiExecution,
  LocalMcpExecution,
  LocalToolExecution,
} from './types';
import { getLocalToolkitMeta, getLocalToolMeta } from './meta';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const compactEnv = (env: Record<string, string | undefined> | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );

const resolveValue = <T>(value: T | ((input: Record<string, unknown>) => T), input: Record<string, unknown>): T =>
  typeof value === 'function' ? (value as (input: Record<string, unknown>) => T)(input) : value;

const parseJsonIfRequested = (stdout: string, parseJson: boolean): unknown => {
  if (!parseJson || stdout.trim().length === 0) return stdout;
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return stdout;
  }
};

const resolveCommandInvocation = async (
  execution: LocalCommandExecution,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalCommandInvocation> => {
  const commandValue = resolveValue(execution.command, input);
  const baseInvocation: LocalCommandInvocation =
    typeof commandValue === 'string' ? { command: commandValue } : commandValue;

  const toolMeta = await getLocalToolMeta(context.finalSlug);
  const toolkitMeta = await getLocalToolkitMeta(context.toolkit.slug);
  const commandOverride = toolMeta?.installation?.command ?? toolkitMeta?.installation?.command;

  return {
    ...baseInvocation,
    command: commandOverride ?? baseInvocation.command,
    args: baseInvocation.args ?? (execution.args ? resolveValue(execution.args, input) : []),
    env: {
      ...compactEnv(execution.env ? resolveValue(execution.env, input) : undefined),
      ...compactEnv(baseInvocation.env),
    },
    cwd: baseInvocation.cwd ?? (execution.cwd ? resolveValue(execution.cwd, input) : undefined),
    stdin: baseInvocation.stdin ?? (execution.stdin ? resolveValue(execution.stdin, input) : undefined),
    timeoutMs: baseInvocation.timeoutMs ?? execution.timeoutMs,
  };
};

export const runLocalCommand = async (
  execution: LocalCommandExecution,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalExecutionResult> => {
  const invocation = await resolveCommandInvocation(execution, input, context);
  const child = spawn(invocation.command, [...(invocation.args ?? [])], {
    cwd: invocation.cwd,
    env: { ...process.env, ...compactEnv(invocation.env) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });

  if (invocation.stdin !== undefined) {
    child.stdin.end(invocation.stdin);
  } else {
    child.stdin.end();
  }

  let timeout: NodeJS.Timeout | undefined;
  if (invocation.timeoutMs && invocation.timeoutMs > 0) {
    timeout = setTimeout(() => child.kill('SIGTERM'), invocation.timeoutMs);
  }

  const exitPromise = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  const errorPromise = once(child, 'error').then(([error]) => {
    throw error;
  }) as Promise<[number | null, NodeJS.Signals | null]>;
  const [exitCode, signal] = await Promise.race([exitPromise, errorPromise]);
  if (timeout) clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      [
        `Local command failed for ${context.finalSlug}: ${invocation.command} ${(invocation.args ?? []).join(' ')}`,
        `exitCode=${exitCode ?? 'null'} signal=${signal ?? 'null'}`,
        stderr.trim() ? `stderr: ${stderr.trim()}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return {
    command: invocation.command,
    args: invocation.args ?? [],
    stdout,
    stderr,
    exitCode,
    parsed: parseJsonIfRequested(stdout, execution.parseJson ?? false),
  };
};

export const runLocalMcpTool = async (
  execution: LocalMcpExecution,
  input: Record<string, unknown>
): Promise<LocalExecutionResult> => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js'),
  ]);

  const server = typeof execution.server === 'function' ? execution.server(input) : execution.server;
  const client = new Client({ name: 'composio-cli-local-tools', version: '0.0.1' });
  const transport = new StdioClientTransport({
    command: server.command,
    args: [...(server.args ?? [])],
    env: { ...compactEnv(process.env), ...compactEnv(server.env) },
    cwd: server.cwd,
  });

  await client.connect(transport);
  try {
    const toolName = execution.toolName
      ? typeof execution.toolName === 'function'
        ? execution.toolName(input)
        : execution.toolName
      : undefined;

    if (!toolName) {
      const result = await client.listTools();
      return { tools: result.tools };
    }

    const args = execution.arguments
      ? typeof execution.arguments === 'function'
        ? execution.arguments(input)
        : execution.arguments
      : input;
    const result = await client.callTool({ name: toolName, arguments: args });
    return { toolName, result: result as unknown as Record<string, unknown> };
  } finally {
    await client.close().catch(() => undefined);
  }
};

const runLocalFfiTool = async (execution: LocalFfiExecution): Promise<LocalExecutionResult> => {
  throw new Error(
    `Local FFI execution is not implemented yet (library=${execution.library}, symbol=${execution.symbol}).`
  );
};

export const executeLocalTool = async (
  execution: LocalToolExecution,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalExecutionResult> => {
  try {
    if (execution.kind === 'native') {
      return await execution.execute(input, context);
    }
    if (execution.kind === 'command') {
      return await runLocalCommand(execution, input, context);
    }
    if (execution.kind === 'mcp') {
      return await runLocalMcpTool(execution, input);
    }
    return await runLocalFfiTool(execution);
  } catch (error) {
    throw new Error(`Failed to execute local tool ${context.finalSlug}: ${toErrorMessage(error)}`, {
      cause: error,
    });
  }
};
