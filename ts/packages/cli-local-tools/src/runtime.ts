import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ensureBundledBinaryExecutable, resolveBundledBinary } from './bundled-binaries';
import type {
  LocalBundledBinaryRef,
  LocalCommandExecution,
  LocalCommandInvocation,
  LocalCommandValue,
  LocalExecutionContext,
  LocalExecutionResult,
  LocalFfiExecution,
  LocalFfiLibraryHandle,
  LocalFfiType,
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

const resolveValue = <T>(
  value: T | ((input: Record<string, unknown>) => T),
  input: Record<string, unknown>
): T =>
  typeof value === 'function' ? (value as (input: Record<string, unknown>) => T)(input) : value;

const parseJsonIfRequested = (stdout: string, parseJson: boolean): unknown => {
  if (!parseJson || stdout.trim().length === 0) return stdout;
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return stdout;
  }
};

const isBundledBinaryRef = (value: unknown): value is LocalBundledBinaryRef =>
  typeof value === 'object' &&
  value !== null &&
  'bundledBinary' in value &&
  typeof (value as { bundledBinary?: unknown }).bundledBinary === 'string';

const commandValueToInvocation = async (
  value: LocalCommandValue,
  context: LocalExecutionContext
): Promise<LocalCommandInvocation> => {
  if (typeof value === 'string') return { command: value };

  if (isBundledBinaryRef(value)) {
    const resolved = await resolveBundledBinary(context.toolkit, value, {
      currentPlatform: context.platform,
    });
    const command = resolved?.exists ? resolved.path : value.fallbackCommand;
    if (!command) {
      throw new Error(
        `Bundled binary ${value.bundledBinary} was not found for ${context.platform} and no fallback command was provided.`
      );
    }
    if (resolved?.exists && resolved.source === 'bundled') {
      await ensureBundledBinaryExecutable(resolved.path);
    }
    return { ...value, command };
  }

  return value;
};

const resolveCommandInvocation = async (
  execution: LocalCommandExecution,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalCommandInvocation> => {
  const commandValue = resolveValue(execution.command, input);
  const baseInvocation = await commandValueToInvocation(commandValue, context);

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
    stdin:
      baseInvocation.stdin ?? (execution.stdin ? resolveValue(execution.stdin, input) : undefined),
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

  const server =
    typeof execution.server === 'function' ? execution.server(input) : execution.server;
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

const ffiTypeMap: Record<LocalFfiType, string> = {
  char: 'char',
  uchar: 'uchar',
  i8: 'i8',
  u8: 'u8',
  i16: 'i16',
  u16: 'u16',
  i32: 'i32',
  u32: 'u32',
  i64: 'i64',
  u64: 'u64',
  f32: 'f32',
  f64: 'f64',
  bool: 'bool',
  ptr: 'ptr',
  cstring: 'cstring',
  void: 'void',
};

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

const resolveFfiLibraryPath = async (
  execution: LocalFfiExecution,
  context: LocalExecutionContext
): Promise<string> => {
  if (typeof execution.library === 'string') return execution.library;
  const resolved = await resolveBundledBinary(context.toolkit, execution.library, {
    currentPlatform: context.platform,
  });
  if (resolved?.exists) return resolved.path;
  if (execution.library.fallbackCommand) return execution.library.fallbackCommand;
  throw new Error(
    `Bundled FFI library ${execution.library.bundledBinary} was not found for ${context.platform}.`
  );
};

const runLocalFfiTool = async (
  execution: LocalFfiExecution,
  input: Record<string, unknown>,
  context: LocalExecutionContext
): Promise<LocalExecutionResult> => {
  if (!isBun) {
    throw new Error(
      'Local FFI execution requires the Bun runtime used by the packaged Composio CLI.'
    );
  }

  const { dlopen, FFIType } = (await import('bun:ffi')) as typeof import('bun:ffi');
  const libraryPath = await resolveFfiLibraryPath(execution, context);
  const bindings = Object.fromEntries(
    Object.entries(execution.symbols).map(([name, symbol]) => [
      name,
      {
        args: symbol.args.map(type => FFIType[ffiTypeMap[type] as keyof typeof FFIType]),
        returns: FFIType[ffiTypeMap[symbol.returns] as keyof typeof FFIType],
      },
    ])
  );
  const library = dlopen(libraryPath, bindings);
  const handle: LocalFfiLibraryHandle = {
    path: libraryPath,
    symbols: library.symbols as Record<string, (...args: ReadonlyArray<unknown>) => unknown>,
  };
  return execution.execute(input, context, handle);
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
    return await runLocalFfiTool(execution, input, context);
  } catch (error) {
    throw new Error(`Failed to execute local tool ${context.finalSlug}: ${toErrorMessage(error)}`, {
      cause: error,
    });
  }
};
