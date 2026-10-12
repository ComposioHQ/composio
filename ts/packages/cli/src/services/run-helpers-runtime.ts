import { cliRequestHeaders } from './client-provenance';
// This module is preloaded into the user's spawned child process, where no Effect
// runtime or @effect/platform layers are provided, so it uses sync Node builtins.
// eslint-disable-next-line no-restricted-imports -- sync fs for run-log appends and run-file writes in the child process, outside the Effect runtime
import * as fs from 'node:fs';
import { ssrfSafeFetch } from '@composio/core/utils/ssrf-guard';
import { ChildProcess as Command } from 'effect/unstable/process';
import * as Path from 'effect/Path';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Result, ManagedRuntime, Predicate, Schema } from 'effect';
import { z } from 'zod';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';
import { NodeOs } from 'src/services/node-os';
import { collectText } from 'src/services/command-runner';
import { debugFlagsToChildEnv } from 'src/services/runtime-flags';
import { toolInputRequiredError } from 'src/utils/tool-input-required';

// One Bun platform runtime shared by every CLI child process this module spawns. ManagedRuntime
// builds the layer lazily on first use, so importers that never spawn a child pay nothing, and a
// run script that spawns many does not rebuild the platform services per call.
const bunCommandRuntime = ManagedRuntime.make(BunServices.layer);

export type RunHelperContext = {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly webURL?: string;
  readonly orgId?: string;
  readonly runId?: string;
  readonly consumerUserId?: string;
  readonly consumerProjectId?: string;
  readonly consumerProjectName?: string;
  readonly perfDebug?: boolean;
  readonly toolDebug?: boolean;
  readonly telemetryDebug?: boolean;
  readonly dryRun?: boolean;
  readonly skipConnectionCheck?: boolean;
  readonly skipToolParamsCheck?: boolean;
  readonly skipChecks?: boolean;
  readonly debug?: boolean;
  readonly runOutputDir?: string;
  readonly runLogFilePath?: string;
};

type RunHelpersInstallParams = {
  readonly cliPrefix: ReadonlyArray<string>;
  readonly helperContext?: RunHelperContext;
};

type RunCliResult = unknown;

type HelperDebugLog = (step: string, details?: Record<string, unknown>) => void;

const ProxySessionResponse = Schema.Struct({ session_id: Schema.NonEmptyString });
const ProxyExecuteCompletedResponse = Schema.Struct({
  // Absent when an older server answers; any other value fails the decode
  // instead of being read as a completed call.
  result_type: Schema.optional(Schema.Literal('completed')),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  binary_data: Schema.optional(Schema.Struct({ url: Schema.optional(Schema.String) })),
  data: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Number),
});
type ProxyExecuteCompletedResponse = Schema.Schema.Type<typeof ProxyExecuteCompletedResponse>;
const ProxyExecuteInputRequiredResponse = Schema.Struct({
  result_type: Schema.Literal('input_required'),
  input_requests: Schema.Record(
    Schema.String,
    Schema.Struct({
      type: Schema.Literal('elicitation'),
      mode: Schema.Literal('form'),
      message: Schema.String,
      requested_schema: Schema.Record(Schema.String, Schema.Unknown),
    })
  ),
  request_state: Schema.optional(Schema.String),
});
const ProxyExecuteResponse = Schema.Union([
  ProxyExecuteInputRequiredResponse,
  ProxyExecuteCompletedResponse,
]);
const isProxyInputRequired = Schema.is(ProxyExecuteInputRequiredResponse);

const proxySchema = {
  type: 'function',
  description:
    "Call proxy(toolkit) to get a fetch-compatible function bound to that toolkit's connected account.",
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['toolkit'],
    properties: {
      toolkit: {
        type: 'string',
        description: 'Toolkit slug whose connected account should be used',
      },
    },
  },
  returns: {
    type: 'function',
    signature: 'fetch(input, init?) => Promise<Response>',
    requestInit: {
      type: 'object',
      additionalProperties: true,
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        headers: { description: 'Standard fetch headers init' },
        body: { description: 'String, JSON-ish value, Blob, ArrayBuffer, or Uint8Array' },
      },
    },
  },
};

const REMOVED_SUB_AGENT_MESSAGE =
  'experimental_subAgent() was removed from composio run because its agent transport automatically approved permission requests. Print the tool results and let the calling agent summarize them instead.';

// Rejects instead of throwing synchronously: the removed helper always returned a
// promise, so scripts that handle its failure with `.catch` or `Promise.allSettled`
// keep doing so.
const removedSubAgent = async (): Promise<never> => {
  throw new Error(REMOVED_SUB_AGENT_MESSAGE);
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

// ---------------------------------------------------------------------------
// Pure helpers — no run-context captures, hoisted to module scope
// ---------------------------------------------------------------------------

export const parseJson = (text: string): unknown => {
  const value = text.trim();
  if (!value) {
    return undefined;
  }
  // Non-JSON output is returned verbatim by design.
  return Result.getOrElse(
    Result.try((): unknown => JSON.parse(value)),
    () => value
  );
};

const executeId = () => crypto.randomUUID().slice(0, 8);

const truncateDebugText = (value: unknown, max = 240) => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const previewDebugValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return truncateDebugText(value.replace(/\s+/g, ' ').trim());
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (Predicate.isObject(value)) {
    const preferred = ['message', 'error', 'title', 'summary', 'brief', 'status'];
    for (const key of preferred) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return truncateDebugText(candidate.trim());
      }
    }
    return `object{${Object.keys(value).slice(0, 4).join(', ')}}`;
  }
  return truncateDebugText(String(value));
};

const formatHelperDebugEvent = (step: string, details: Record<string, unknown> = {}) => {
  switch (step) {
    case 'execute.prepare':
      return `[execute] ${details.slug}`;
    case 'search.prepare':
      return `[search] ${truncateDebugText(details.query || '', 96)}`;
    case 'proxy.request':
      return `[proxy] ${details.method} ${truncateDebugText(details.endpoint || '', 96)}`;
    case 'cli.result': {
      const command = typeof details.command === 'string' ? details.command : 'cli';
      const state = details.successful === false ? 'failed' : 'ok';
      const preview = previewDebugValue(details.preview);
      return `[${command}] ${state}${preview ? ` ${preview}` : ''}`;
    }
    case 'cli.error': {
      const command = typeof details.command === 'string' ? details.command : 'cli';
      const stderr = previewDebugValue(details.stderr);
      return `[${command}] failed${stderr ? ` ${stderr}` : ''}`;
    }
    default:
      return null;
  }
};

const stringifyForPrompt = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return Result.getOrElse(
    Result.try(() => JSON.stringify(value, null, 2)),
    () => String(value)
  );
};

const attachPromptMethod = <T>(value: T): T => {
  if (!Predicate.isObject(value)) return value;
  if (typeof value.prompt === 'function') return value;
  Object.defineProperty(value, 'prompt', {
    value: () => stringifyForPrompt('data' in value ? value.data : value),
    enumerable: false,
  });
  return value;
};

const isPlainObjectForExecute = Predicate.isObject;

const runFileExtensionFromMimeType = (mimeType: string | undefined): string => {
  if (typeof mimeType !== 'string' || mimeType.trim().length === 0) return 'bin';
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const explicit: Record<string, string> = {
    'text/plain': 'txt',
    'application/json': 'json',
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  if (explicit[normalized]) return explicit[normalized];
  const subtype = normalized.split('/')[1] || 'bin';
  return subtype.includes('+') ? (subtype.split('+').pop() ?? 'bin') : subtype;
};

const describeDebugValue = (value: unknown) => {
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (Predicate.isObject(value)) {
    return { type: 'object', keys: Object.keys(value).slice(0, 20) };
  }
  return {
    type: typeof value,
    value: typeof value === 'string' ? value.slice(0, 200) : (value ?? null),
  };
};

const summarizeCliResultPreview = (result: RunCliResult): unknown => {
  if (!Predicate.isObject(result)) return result;
  if ('data' in result && result.data !== undefined) return result.data;
  if (typeof result.error === 'string' && result.error.trim().length > 0)
    return result.error.trim();
  return result;
};

const normalizeProxyToolkit = (toolkit: string) => {
  if (typeof toolkit !== 'string' || toolkit.trim().length === 0) {
    throw new Error('proxy() requires a non-empty toolkit string.');
  }
  return toolkit.trim();
};

const normalizeFetchHeaders = (headers: HeadersInit | undefined) => {
  if (!headers) return [];
  const normalized: Array<{ name: string; type: string; value: string }> = [];
  new Headers(headers).forEach((value, name) => {
    normalized.push({ name, type: 'header', value });
  });
  return normalized;
};

const normalizeFetchBody = async (body: unknown) => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string' || typeof body === 'number' || typeof body === 'boolean')
    return body;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return await body.text();
  if (body instanceof ArrayBuffer) return encodeBase64(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) {
    return encodeBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }
  return body;
};

const normalizeFetchInput = async (input: unknown, init: RequestInit = {}) => {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    throw new Error(
      'proxy() does not support passing a Request instance yet. Pass a URL string and init instead.'
    );
  }
  const endpoint = input instanceof URL ? input.toString() : input;
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new Error('proxy fetch requires a non-empty URL string or URL object.');
  }
  const method = typeof init.method === 'string' ? init.method.toUpperCase() : 'GET';
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    throw new Error('proxy fetch only supports GET, POST, PUT, DELETE, PATCH.');
  }
  return {
    endpoint: endpoint.trim(),
    method,
    parameters: normalizeFetchHeaders(init.headers),
    body: await normalizeFetchBody(init.body),
  };
};

const toProxyResponse = async (result: ProxyExecuteCompletedResponse) => {
  const headers = new Headers(result?.headers || {});
  if (result?.binary_data?.url) {
    const binaryResponse = await ssrfSafeFetch(
      result.binary_data.url,
      {},
      {
        requirePinnedConnection: true,
      }
    );
    binaryResponse.headers.forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value);
    });
    return new Response(binaryResponse.body, {
      status: result.status ?? binaryResponse.status,
      headers,
    });
  }
  if (result?.data === undefined || result?.data === null) {
    return new Response(null, { status: result?.status ?? 200, headers });
  }
  if (typeof result.data === 'string') {
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8');
    return new Response(result.data, { status: result.status ?? 200, headers });
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(result.data), { status: result.status ?? 200, headers });
};

// ---------------------------------------------------------------------------
// Helper factories — capture the per-run context passed by installRunHelpers
// ---------------------------------------------------------------------------

type RunHelperLoggers = {
  readonly perfDebugLog: (phase: string, label: string, details?: Record<string, unknown>) => void;
  readonly helperDebugLog: HelperDebugLog;
};

const createRunHelperLoggers = (params: {
  readonly helperContext: RunHelperContext;
  readonly writeError: (line: string) => void;
  readonly sharedRunLogFilePath: string | null;
  readonly perfDebugEnabled: boolean;
  readonly perfDebugStart: number;
}): RunHelperLoggers => {
  const { helperContext, writeError, sharedRunLogFilePath, perfDebugEnabled, perfDebugStart } =
    params;

  const appendRunLogLine = (line: string) => {
    if (!sharedRunLogFilePath || line.length === 0) return;
    fs.appendFileSync(sharedRunLogFilePath, `${line}\n`, 'utf8');
  };

  const perfDebugLog = (phase: string, label: string, details: Record<string, unknown> = {}) => {
    if (!perfDebugEnabled) return;
    const elapsedMs = Date.now() - perfDebugStart;
    const payload = { phase, label, elapsedMs, ...details };
    writeError(`[perf] ${JSON.stringify(payload)}`);
  };

  const helperDebugLog: HelperDebugLog = (step, details = {}) => {
    const formattedLine = formatHelperDebugEvent(step, details);
    const elapsedMs = Date.now() - perfDebugStart;
    const line = formattedLine ?? `[run:debug] ${JSON.stringify({ step, elapsedMs, ...details })}`;
    appendRunLogLine(line);
    if (helperContext.debug === true) {
      writeError(line);
    }
  };

  return { perfDebugLog, helperDebugLog };
};

const createExecutePayloadMaterializer = (params: {
  readonly path: Path.Path;
  readonly tmpdir: string;
  readonly sharedRunOutputDir: string | null;
}): ((value: unknown) => Promise<unknown>) => {
  const { path, tmpdir, sharedRunOutputDir } = params;

  const writeTempExecuteFile = async (value: unknown): Promise<unknown> => {
    const outputDir = sharedRunOutputDir || path.join(tmpdir, 'composio-run-files');
    fs.mkdirSync(outputDir, { recursive: true });
    if (typeof File !== 'undefined' && value instanceof File) {
      const safeName =
        typeof value.name === 'string' && value.name.trim().length > 0
          ? value.name
          : `file-${executeId()}.${runFileExtensionFromMimeType(value.type)}`;
      const filePath = path.join(outputDir, `${executeId()}-${safeName}`);
      fs.writeFileSync(filePath, new Uint8Array(await value.arrayBuffer()));
      return filePath;
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      const filePath = path.join(
        outputDir,
        `${executeId()}.${runFileExtensionFromMimeType(value.type)}`
      );
      fs.writeFileSync(filePath, new Uint8Array(await value.arrayBuffer()));
      return filePath;
    }
    return value;
  };

  const materializeExecutePayload = async (value: unknown): Promise<unknown> => {
    if (typeof File !== 'undefined' && value instanceof File) return writeTempExecuteFile(value);
    if (typeof Blob !== 'undefined' && value instanceof Blob) return writeTempExecuteFile(value);
    if (Array.isArray(value)) {
      return Promise.all(value.map(item => materializeExecutePayload(item)));
    }
    if (isPlainObjectForExecute(value)) {
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, entryValue]) => [
          key,
          await materializeExecutePayload(entryValue),
        ])
      );
      return Object.fromEntries(entries);
    }
    return value;
  };

  return materializeExecutePayload;
};

const createCliRunner = (params: {
  readonly cliPrefix: ReadonlyArray<string>;
  readonly helperContext: RunHelperContext;
  readonly sharedRunOutputDir: string | null;
  readonly perfDebugEnabled: boolean;
  readonly toolDebugEnabled: boolean;
  readonly loggers: RunHelperLoggers;
}): ((args: ReadonlyArray<string>) => Promise<RunCliResult>) => {
  const { cliPrefix, helperContext, sharedRunOutputDir, perfDebugEnabled, toolDebugEnabled } =
    params;
  const { perfDebugLog, helperDebugLog } = params.loggers;
  let perfDebugSeq = 0;

  const maybeLoadStoredCliResult = (result: RunCliResult): RunCliResult => {
    if (!Predicate.isObject(result) || result.storedInFile !== true) {
      return attachPromptMethod(result);
    }
    helperDebugLog('cli.result.stored_in_file', {
      outputFilePath: result.outputFilePath ?? null,
      tokenCount: result.tokenCount ?? null,
    });
    const outputFilePath = typeof result.outputFilePath === 'string' ? result.outputFilePath : null;
    return attachPromptMethod({
      ...result,
      data: {
        storedInFilePath: outputFilePath !== null,
        outputFilePath,
      },
    });
  };

  const logCliResultPreview = (
    requestId: string,
    command: string | undefined,
    result: RunCliResult
  ) => {
    if (!Predicate.isObject(result)) {
      helperDebugLog('cli.result', {
        requestId,
        command,
        preview: result,
        result: describeDebugValue(result),
      });
      return;
    }
    helperDebugLog('cli.result', {
      requestId,
      command,
      successful: result.successful ?? null,
      storedInFile: result.storedInFile ?? false,
      outputFilePath: result.outputFilePath ?? null,
      error: result.error ?? null,
      topLevelKeys: Object.keys(result).slice(0, 20),
      data: 'data' in result ? describeDebugValue(result.data) : null,
      preview: summarizeCliResultPreview(result),
    });
  };

  // Invariant for the life of the run session, so built once rather than per
  // spawned CLI call.
  const env: Record<string, string> = {
    // The platform command inherits the ambient environment by default. An
    // empty BUN_BE_BUN masks the parent run process's Bun compatibility flag
    // without copying or enumerating unrelated values.
    BUN_BE_BUN: '',
    ...(helperContext.apiKey ? { COMPOSIO_USER_API_KEY: helperContext.apiKey } : {}),
    ...(helperContext.baseURL ? { COMPOSIO_BASE_URL: helperContext.baseURL } : {}),
    ...(helperContext.webURL ? { COMPOSIO_WEB_URL: helperContext.webURL } : {}),
    COMPOSIO_CLI_INVOCATION_ORIGIN: 'run',
    ...(helperContext.runId ? { COMPOSIO_CLI_PARENT_RUN_ID: helperContext.runId } : {}),
    ...(sharedRunOutputDir ? { COMPOSIO_RUN_OUTPUT_DIR: sharedRunOutputDir } : {}),
    ...debugFlagsToChildEnv({
      perfDebug: perfDebugEnabled,
      toolDebug: toolDebugEnabled,
      telemetryDebug: helperContext.telemetryDebug === true,
    }),
  };

  const runCliJson = async (args: ReadonlyArray<string>): Promise<RunCliResult> => {
    const requestId = `${args[0] ?? 'cli'}#${++perfDebugSeq}`;
    helperDebugLog('cli.start', { requestId, args });
    perfDebugLog('start', requestId, { cmd: args });
    const [executable, ...commandArgs] = [...cliPrefix, ...args];
    const inheritStderr = perfDebugEnabled || toolDebugEnabled;
    const { exitCode, stderr, stdout } = await bunCommandRuntime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const child = yield* Command.make(executable, commandArgs, {
            env,
            extendEnv: true,
            stdin: 'inherit',
            stderr: inheritStderr ? 'inherit' : 'pipe',
          });
          const [childExitCode, childStdout, childStderr] = yield* Effect.all(
            [
              child.exitCode,
              collectText(child.stdout),
              inheritStderr ? Effect.succeed('') : collectText(child.stderr),
            ],
            { concurrency: 'unbounded' }
          );
          return {
            exitCode: Number(childExitCode),
            stdout: childStdout,
            stderr: childStderr,
          };
        })
      )
    );
    const result = maybeLoadStoredCliResult(parseJson(stdout));
    if (exitCode !== 0) {
      perfDebugLog('error', requestId, { exitCode, stderr: stderr.trim() || undefined });
      helperDebugLog('cli.error', {
        requestId,
        command: args[0],
        exitCode,
        stderr: stderr.trim() || undefined,
      });
      const error = new Error(`composio ${args.join(' ')} failed with exit code ${exitCode}`);
      Object.assign(error, { exitCode, result, stderr: stderr.trim() || undefined });
      throw error;
    }
    if (result === undefined) {
      const details = stderr.trim();
      const suffix = details ? `: ${details}` : '';
      perfDebugLog('error', requestId, { exitCode, stderr: details || undefined, noJson: true });
      helperDebugLog('cli.error', {
        requestId,
        command: args[0],
        exitCode,
        stderr: details || undefined,
        noJson: true,
      });
      const error = new Error(`composio ${args.join(' ')} returned no JSON output${suffix}`);
      Object.assign(error, { exitCode, result, stderr: details || undefined });
      throw error;
    }
    perfDebugLog('end', requestId, {
      exitCode,
      stdoutBytes: stdout.length,
      stderrBytes: stderr.length,
    });
    logCliResultPreview(requestId, args[0], result);
    helperDebugLog('cli.done', { requestId, exitCode });
    return result;
  };

  return runCliJson;
};

const createSearchAndExecuteHelpers = (params: {
  readonly helperContext: RunHelperContext;
  readonly sharedRunOutputDir: string | null;
  readonly runCliJson: (args: ReadonlyArray<string>) => Promise<RunCliResult>;
  readonly materializeExecutePayload: (value: unknown) => Promise<unknown>;
  readonly helperDebugLog: HelperDebugLog;
}) => {
  const {
    helperContext,
    sharedRunOutputDir,
    runCliJson,
    materializeExecutePayload,
    helperDebugLog,
  } = params;

  const search = async (
    query: string,
    options: Record<string, unknown> = {}
  ): Promise<RunCliResult> => {
    helperDebugLog('search.prepare', { query, options });
    const args = ['search', query];
    if (Array.isArray(options.toolkits) && options.toolkits.length > 0) {
      args.push('--toolkits', options.toolkits.join(','));
    } else if (typeof options.toolkits === 'string' && options.toolkits.trim().length > 0) {
      args.push('--toolkits', options.toolkits);
    }
    if (typeof options.limit === 'number') {
      args.push('--limit', String(options.limit));
    }
    return runCliJson(args);
  };

  const execute = async (
    slug: string,
    data: unknown = {},
    options: { account?: string } = {}
  ): Promise<RunCliResult> => {
    helperDebugLog('execute.prepare', {
      slug,
      hasData: data !== undefined,
      account: options.account ?? null,
    });
    const args = ['execute', slug];
    if (helperContext.dryRun === true) args.push('--dry-run');
    if (helperContext.skipConnectionCheck === true) args.push('--skip-connection-check');
    if (helperContext.skipToolParamsCheck === true) args.push('--skip-tool-params-check');
    if (helperContext.skipChecks === true) args.push('--skip-checks');
    if (typeof options.account === 'string' && options.account.trim().length > 0) {
      args.push('--account', options.account.trim());
    }
    if (data !== undefined) {
      const preparedData = await materializeExecutePayload(data);
      const serialized =
        typeof preparedData === 'string' ? preparedData : JSON.stringify(preparedData);
      if (sharedRunOutputDir) {
        const tmpFile = `${sharedRunOutputDir}/execute-data-${slug}-${executeId()}.json`;
        fs.writeFileSync(tmpFile, serialized, 'utf8');
        args.push('--data', `@${tmpFile}`);
      } else {
        args.push('--data', serialized);
      }
    }
    const result = await runCliJson(args);
    if (Predicate.isObject(result) && result.successful === false) {
      const message =
        typeof result.error === 'string' && result.error.trim().length > 0
          ? result.error.trim()
          : `composio execute ${slug} failed`;
      const error = new Error(message);
      Object.assign(error, { result, slug });
      throw error;
    }
    return result;
  };

  return { search, execute };
};

const createProxyHelper = (params: {
  readonly helperContext: RunHelperContext;
  readonly composioBaseURL: string;
  readonly helperDebugLog: HelperDebugLog;
}) => {
  const { helperContext, composioBaseURL, helperDebugLog } = params;
  const proxySessionCache = new Map<string, string>();

  const requireConsumerProxyContext = () => {
    if (!helperContext.apiKey) {
      throw new Error('proxy() requires an authenticated Composio user session.');
    }
    if (!helperContext.orgId || !helperContext.consumerProjectId || !helperContext.consumerUserId) {
      throw new Error(
        'proxy() requires a consumer project context so it can use the consumer project credentials.'
      );
    }
    return {
      apiKey: helperContext.apiKey,
      orgId: helperContext.orgId,
      projectId: helperContext.consumerProjectId,
      userId: helperContext.consumerUserId,
    };
  };

  const fetchComposioJson = async (pathname: string, body: Record<string, unknown>) => {
    const auth = requireConsumerProxyContext();
    const response = await fetch(`${composioBaseURL}${pathname}`, {
      method: 'POST',
      headers: {
        ...cliRequestHeaders(),
        'content-type': 'application/json',
        'x-user-api-key': auth.apiKey,
        'x-org-id': auth.orgId,
        'x-project-id': auth.projectId,
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    const parsed = parseJson(raw);
    if (!response.ok) {
      const responseMessage = Predicate.isObject(parsed) ? parsed.message : undefined;
      const responseError = Predicate.isObject(parsed) ? parsed.error : undefined;
      const detail =
        typeof parsed === 'string'
          ? parsed
          : typeof responseMessage === 'string'
            ? responseMessage
            : typeof responseError === 'string'
              ? responseError
              : raw.trim() || undefined;
      const error = new Error(
        `Composio proxy request failed with status ${response.status}${detail ? `: ${detail}` : ''}`
      );
      Object.assign(error, { status: response.status, response: parsed ?? raw });
      throw error;
    }
    return parsed;
  };

  const getProxySessionId = async (toolkit: string) => {
    const cached = proxySessionCache.get(toolkit);
    if (cached) return cached;
    const auth = requireConsumerProxyContext();
    const created = await Schema.decodeUnknownPromise(ProxySessionResponse)(
      await fetchComposioJson('/api/v3/tool_router/session', {
        user_id: auth.userId,
        manage_connections: { enable: false },
        toolkits: { enable: [toolkit] },
      })
    );
    const sessionId = created.session_id;
    proxySessionCache.set(toolkit, sessionId);
    return sessionId;
  };

  const proxy = async (toolkit: string) => {
    const normalizedToolkit = normalizeProxyToolkit(toolkit);
    helperDebugLog('proxy.session', {
      toolkit: normalizedToolkit,
      cached: proxySessionCache.has(normalizedToolkit),
    });
    const sessionId = await getProxySessionId(normalizedToolkit);
    const proxyFetch = async (input: string | URL, init: RequestInit = {}) => {
      const request = await normalizeFetchInput(input, init);
      helperDebugLog('proxy.request', {
        toolkit: normalizedToolkit,
        method: request.method,
        endpoint: request.endpoint,
      });
      const result = await Schema.decodeUnknownPromise(ProxyExecuteResponse)(
        await fetchComposioJson(`/api/v3/tool_router/session/${sessionId}/proxy_execute`, {
          toolkit_slug: normalizedToolkit,
          endpoint: request.endpoint,
          method: request.method,
          ...(request.body !== undefined ? { body: request.body } : {}),
          ...(request.parameters.length > 0
            ? {
                parameters: request.parameters.map(parameter => ({
                  name: parameter.name,
                  type: parameter.type,
                  value: String(parameter.value),
                })),
              }
            : {}),
        })
      );
      // An approval request is not a response from the proxied API: converting
      // it would hand the script an empty 200 for a call that never ran.
      if (isProxyInputRequired(result)) {
        // The error is thrown into the user's script, where it is likely to be
        // logged whole. `request_state` is continuation state the CLI cannot
        // use yet, so it is left off the error.
        throw toolInputRequiredError(`${request.method} proxy call via "${normalizedToolkit}"`, {
          input_requests: result.input_requests,
        });
      }
      return toProxyResponse(result);
    };
    Object.defineProperty(proxyFetch, 'toolkit', { value: normalizedToolkit });
    return proxyFetch;
  };

  Object.defineProperty(proxy, 'schema', { value: proxySchema });
  return proxy;
};

export const installRunHelpers = async ({
  cliPrefix,
  helperContext = {},
}: RunHelpersInstallParams): Promise<void> => {
  // This preload runs in the user's child process, outside the CLI runtime.
  // Resolve the live services once at that boundary and keep all writes centralized.
  const terminal = Effect.runSync(TerminalUI.pipe(Effect.provide(TerminalUILive)));
  const path = Effect.runSync(Path.Path.pipe(Effect.provide(Path.layer)));
  const nodeOs = Effect.runSync(NodeOs.pipe(Effect.provide(NodeOs.Default)));
  const writeError = (line: string) => Effect.runSync(terminal.error(line));

  Reflect.set(globalThis, 'z', z);
  Reflect.set(globalThis, 'zod', z);

  const perfDebugEnabled = helperContext.perfDebug === true;
  const toolDebugEnabled = helperContext.toolDebug === true;
  const perfDebugStart = Date.now();
  const composioBaseURL = (helperContext.baseURL || 'https://backend.composio.dev').replace(
    /\/$/,
    ''
  );
  const sharedRunOutputDir =
    typeof helperContext.runOutputDir === 'string' && helperContext.runOutputDir.length > 0
      ? helperContext.runOutputDir
      : null;
  const sharedRunLogFilePath =
    typeof helperContext.runLogFilePath === 'string' && helperContext.runLogFilePath.length > 0
      ? helperContext.runLogFilePath
      : null;

  const loggers = createRunHelperLoggers({
    helperContext,
    writeError,
    sharedRunLogFilePath,
    perfDebugEnabled,
    perfDebugStart,
  });
  const { helperDebugLog } = loggers;

  const materializeExecutePayload = createExecutePayloadMaterializer({
    path,
    tmpdir: nodeOs.tmpdir,
    sharedRunOutputDir,
  });
  const runCliJson = createCliRunner({
    cliPrefix,
    helperContext,
    sharedRunOutputDir,
    perfDebugEnabled,
    toolDebugEnabled,
    loggers,
  });
  const { search, execute } = createSearchAndExecuteHelpers({
    helperContext,
    sharedRunOutputDir,
    runCliJson,
    materializeExecutePayload,
    helperDebugLog,
  });

  Reflect.set(globalThis, 'experimental_subAgent', removedSubAgent);
  Reflect.set(globalThis, 'invokeAgent', removedSubAgent);

  const proxy = createProxyHelper({ helperContext, composioBaseURL, helperDebugLog });

  Reflect.set(globalThis, 'search', search);
  Reflect.set(globalThis, 'execute', execute);
  Reflect.set(globalThis, 'proxy', proxy);

  Object.defineProperty(globalThis, '__composioRunContext', {
    value: Object.freeze({
      outputDir: sharedRunOutputDir,
      logFilePath: sharedRunLogFilePath,
    }),
    configurable: true,
  });

  Object.defineProperty(globalThis, '__composioConsumerContext', {
    value: helperContext,
    configurable: true,
  });
};
