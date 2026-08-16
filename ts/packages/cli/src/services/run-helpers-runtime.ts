// This module is preloaded into the user's spawned child process, where no Effect
// runtime or @effect/platform layers are provided, so it uses sync Node builtins.
// eslint-disable-next-line no-restricted-imports -- sync fs for run-log appends, run-file writes, and CLI config reads in the child process, outside the Effect runtime
import * as fs from 'node:fs';
import { Command, Path } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import { Effect, Either, ManagedRuntime, Predicate, Schema } from 'effect';
import { z } from 'zod';
import { JsonRecordSchema } from 'src/effects/json';
import type { MasterKind } from 'src/services/master-detector';
import {
  isAcpInvokeError,
  parseJson,
  type HelperDebugLog,
  type InvokeAgentNormalizedOptions,
} from 'src/services/run-subagent-shared';
import { invokeAcpSubAgent } from 'src/services/run-subagent-acp';
import { invokeLegacySubAgent } from 'src/services/run-subagent-legacy';
import { TerminalUI, TerminalUILive } from 'src/services/terminal-ui';
import { NodeOs } from 'src/services/node-os';
import { collectText } from 'src/services/command-runner';
import { debugFlagsToChildEnv } from 'src/services/runtime-flags';

// One Bun platform runtime shared by every CLI child process this module spawns. ManagedRuntime
// builds the layer lazily on first use, so importers that never spawn a child pay nothing, and a
// run script that spawns many does not rebuild the platform services per call.
const bunCommandRuntime = ManagedRuntime.make(BunContext.layer);

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
  readonly master?: MasterKind;
  readonly debug?: boolean;
  readonly acpOnly?: boolean;
  readonly logsOff?: boolean;
  readonly runOutputDir?: string;
  readonly runLogFilePath?: string;
  readonly readAccessRoots?: ReadonlyArray<string>;
  readonly cliConfigPath?: string;
};

type RunHelpersInstallParams = {
  readonly cliPrefix: ReadonlyArray<string>;
  readonly helperContext?: RunHelperContext;
};

type RunCliResult = unknown;

const JsonObject = JsonRecordSchema;
const ExperimentalSubagentConfig = Schema.Struct({
  experimental_subagent: Schema.optional(
    Schema.Struct({ target: Schema.optional(Schema.Unknown) })
  ),
});
const decodeExperimentalSubagentConfig = Schema.decodeUnknownSync(
  Schema.parseJson(ExperimentalSubagentConfig)
);
const ProxySessionResponse = Schema.Struct({ session_id: Schema.NonEmptyString });
const ProxyExecuteResponse = Schema.Struct({
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  binary_data: Schema.optional(Schema.Struct({ url: Schema.optional(Schema.String) })),
  data: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Number),
});
type ProxyExecuteResponse = Schema.Schema.Type<typeof ProxyExecuteResponse>;

const experimentalSubAgentSchema = {
  type: 'function',
  description:
    'Experimental helper: prompt a sub-agent from the same agent family as the current main agent (Codex -> Codex, Claude -> Claude) and return its final response.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', description: 'The prompt to send to the agent CLI.' },
      target: {
        type: 'string',
        enum: ['claude', 'codex', 'user'],
        description: 'Optional master override. Defaults to the detected current master.',
      },
      model: {
        type: 'string',
        description: 'Optional model override passed through to the agent CLI.',
      },
      schema: {
        description:
          'Optional structured-output schema. Accepts a Zod schema or raw JSON Schema object.',
      },
      jsonSchema: {
        description: 'Optional JSON Schema requesting structured output from the agent.',
      },
    },
  },
  returns: {
    type: 'object',
    additionalProperties: false,
    required: ['master', 'target', 'result'],
    properties: {
      master: { type: 'string', enum: ['claude', 'codex', 'user'] },
      target: { type: 'string', enum: ['claude', 'codex'] },
      result: { description: 'Final plain-text result when available.' },
      structuredOutput: { description: 'Structured output when jsonSchema was requested.' },
      logFilePath: { description: 'Path to the local run log file for helper execution details.' },
    },
  },
};

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
  if (Predicate.isRecord(value)) {
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
    case 'subAgent.target':
      return `[experimental_subAgent] triggered with ${details.resolvedTarget}`;
    case 'subAgent.acp.resolve':
      return `[experimental_subAgent] ACP via ${details.source} (${details.target})`;
    case 'subAgent.acp.initialized':
      return `[experimental_subAgent] ACP initialized (${details.target})`;
    case 'subAgent.acp.session':
      return `[experimental_subAgent] session ready (${details.target})`;
    case 'subAgent.acp.model':
      return details.applied === true
        ? `[experimental_subAgent] model=${details.model}`
        : `[experimental_subAgent] model unchanged (${details.model})`;
    case 'subAgent.acp.message': {
      const text = previewDebugValue(details.text);
      return text ? `[experimental_subAgent] ${text}` : null;
    }
    case 'subAgent.acp.thought': {
      const text = previewDebugValue(details.text);
      return text ? `[experimental_subAgent:thinking] ${text}` : null;
    }
    case 'subAgent.acp.tool_call': {
      const locations = Array.isArray(details.locations) ? details.locations : [];
      const where = locations.length > 0 ? ` ${locations.slice(0, 2).join(', ')}` : '';
      return `[experimental_subAgent:tool] ${details.status || 'pending'} ${
        details.title || details.kind || 'tool'
      }${where}`;
    }
    case 'subAgent.acp.tool_call_update': {
      const locations = Array.isArray(details.locations) ? details.locations : [];
      const where = locations.length > 0 ? ` ${locations.slice(0, 2).join(', ')}` : '';
      const preview = previewDebugValue(details.rawOutput);
      return `[experimental_subAgent:tool] ${details.status || 'update'} ${
        details.title || details.toolCallId || details.kind || 'tool'
      }${where}${preview ? ` -> ${preview}` : ''}`;
    }
    case 'subAgent.acp.plan': {
      const entries = Array.isArray(details.entries)
        ? details.entries.filter(Predicate.isRecord)
        : [];
      if (entries.length === 0) return '[experimental_subAgent:plan] updated';
      const summary = entries
        .slice(0, 3)
        .map(entry => {
          const status = typeof entry.status === 'string' ? entry.status : 'pending';
          const content = typeof entry.content === 'string' ? entry.content : '';
          return `${status}:${truncateDebugText(content, 48)}`;
        })
        .join(' | ');
      return `[experimental_subAgent:plan] ${summary}`;
    }
    case 'subAgent.acp.fallback':
      return `[experimental_subAgent] ACP fallback (${details.code})`;
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
  return Either.getOrElse(
    Either.try(() => JSON.stringify(value, null, 2)),
    () => String(value)
  );
};

const attachPromptMethod = <T>(value: T): T => {
  if (!Predicate.isRecord(value)) return value;
  if (typeof value.prompt === 'function') return value;
  Object.defineProperty(value, 'prompt', {
    value: () => stringifyForPrompt('data' in value ? value.data : value),
    enumerable: false,
  });
  return value;
};

const isPlainObjectForExecute = Predicate.isRecord;

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
  if (Predicate.isRecord(value)) {
    return { type: 'object', keys: Object.keys(value).slice(0, 20) };
  }
  return {
    type: typeof value,
    value: typeof value === 'string' ? value.slice(0, 200) : (value ?? null),
  };
};

const summarizeCliResultPreview = (result: RunCliResult): unknown => {
  if (!Predicate.isRecord(result)) return result;
  if ('data' in result && result.data !== undefined) return result.data;
  if (typeof result.error === 'string' && result.error.trim().length > 0)
    return result.error.trim();
  return result;
};

const readConfiguredExperimentalSubagentTarget = (
  cliConfigPath: string | undefined
): 'auto' | 'claude' | 'codex' => {
  if (!cliConfigPath) return 'auto';

  return Either.getOrElse(
    Either.try(() => {
      const raw = fs.readFileSync(cliConfigPath, 'utf8');
      const parsed = decodeExperimentalSubagentConfig(raw);
      const target = parsed.experimental_subagent?.target;
      return target === 'claude' || target === 'codex' || target === 'auto' ? target : 'auto';
    }),
    () => 'auto' as const
  );
};

const normalizeInvokeAgentOptions = (
  options: Record<string, unknown> = {}
): InvokeAgentNormalizedOptions => {
  if (options == null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('experimental_subAgent() options must be an object when provided.');
  }
  if (options.schema !== undefined && options.jsonSchema !== undefined) {
    throw new Error(
      'experimental_subAgent() accepts either options.schema or options.jsonSchema, not both.'
    );
  }
  const requestedTarget = options.target;
  if (
    requestedTarget !== undefined &&
    requestedTarget !== 'claude' &&
    requestedTarget !== 'codex' &&
    requestedTarget !== 'user'
  ) {
    throw new Error(
      'experimental_subAgent() target must be "claude", "codex", or "user" when provided.'
    );
  }
  const inputSchema = options.schema ?? options.jsonSchema;
  let structuredSchema: Record<string, unknown> | undefined;
  let zodSchema: z.ZodType | undefined;
  if (inputSchema !== undefined) {
    if (inputSchema instanceof z.ZodType) {
      if (typeof z.toJSONSchema !== 'function') {
        throw new Error(
          'experimental_subAgent() requires Zod 4 with z.toJSONSchema() when using options.schema.'
        );
      }
      zodSchema = inputSchema;
      const generatedSchema = z.toJSONSchema(inputSchema);
      structuredSchema = Schema.decodeUnknownSync(JsonObject)(generatedSchema);
    } else if (Predicate.isRecord(inputSchema)) {
      structuredSchema = inputSchema;
    } else {
      throw new Error('experimental_subAgent() schema must be a Zod schema or JSON Schema object.');
    }
  }
  return {
    ...(requestedTarget === undefined ? {} : { target: requestedTarget }),
    ...(typeof options.model === 'string' ? { model: options.model } : {}),
    ...(options.schema === undefined ? {} : { schema: options.schema }),
    ...(options.jsonSchema === undefined ? {} : { jsonSchema: options.jsonSchema }),
    ...(structuredSchema === undefined ? {} : { structuredSchema }),
    ...(zodSchema === undefined ? {} : { zodSchema }),
  };
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

const toProxyResponse = async (result: ProxyExecuteResponse) => {
  const headers = new Headers(result?.headers || {});
  if (result?.binary_data?.url) {
    const binaryResponse = await fetch(result.binary_data.url);
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

  const shouldStreamHelperLog = (step: string, formattedLine: string | null): boolean => {
    if (helperContext.logsOff === true) return false;
    if (helperContext.debug === true) return true;
    return formattedLine !== null && (step.startsWith('subAgent.') || step.startsWith('agent.'));
  };

  const helperDebugLog: HelperDebugLog = (step, details = {}) => {
    const formattedLine = formatHelperDebugEvent(step, details);
    const elapsedMs = Date.now() - perfDebugStart;
    const line = formattedLine ?? `[run:debug] ${JSON.stringify({ step, elapsedMs, ...details })}`;
    appendRunLogLine(line);
    if (shouldStreamHelperLog(step, formattedLine)) {
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
    if (!Predicate.isRecord(result) || result.storedInFile !== true) {
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
    if (!Predicate.isRecord(result)) {
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
      acpOnly: helperContext.acpOnly === true,
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
          const command = Command.make(executable, ...commandArgs).pipe(
            Command.env(env),
            Command.stdin('inherit'),
            Command.stderr(inheritStderr ? 'inherit' : 'pipe')
          );
          const child = yield* Command.start(command);
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
    if (Predicate.isRecord(result) && result.successful === false) {
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

const createExperimentalSubAgent = (params: {
  readonly helperContext: RunHelperContext;
  readonly helperDebugLog: HelperDebugLog;
}) => {
  const { helperContext, helperDebugLog } = params;

  // The parent CLI resolves the master via `detectMasterFromHost` and serializes
  // it into `helperContext` (see run.cmd.ts), so a missing or unrecognized value
  // deliberately falls back to 'user' instead of re-detecting from this child
  // process's environment.
  const detectInvokeAgentMaster = (): MasterKind | 'user' => {
    if (
      helperContext.master === 'claude' ||
      helperContext.master === 'codex' ||
      helperContext.master === 'user'
    ) {
      return helperContext.master;
    }
    return 'user';
  };

  const resolveInvokeAgentTarget = (requestedTarget?: string): 'claude' | 'codex' => {
    if (requestedTarget === 'claude' || requestedTarget === 'codex') return requestedTarget;
    const configuredTarget = readConfiguredExperimentalSubagentTarget(helperContext.cliConfigPath);
    if (configuredTarget === 'claude' || configuredTarget === 'codex') return configuredTarget;
    const detected = requestedTarget === 'user' ? 'user' : detectInvokeAgentMaster();
    if (detected === 'codex' || detected === 'claude') return detected;
    if (typeof Bun.which === 'function' && Bun.which('codex')) return 'codex';
    if (typeof Bun.which === 'function' && Bun.which('claude')) return 'claude';
    throw new Error(
      'experimental_subAgent() could not determine an agent CLI. Current master is user; install codex or claude, or pass { target: "codex" | "claude" }.'
    );
  };

  const experimentalSubAgentImpl = async (
    prompt: string,
    options: Record<string, unknown> = {}
  ) => {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('experimental_subAgent() requires a non-empty prompt string.');
    }
    const logFilePath =
      typeof helperContext.runLogFilePath === 'string' && helperContext.runLogFilePath.length > 0
        ? helperContext.runLogFilePath
        : undefined;
    const normalizedOptions = normalizeInvokeAgentOptions(options);
    const target = resolveInvokeAgentTarget(normalizedOptions.target);
    const master = detectInvokeAgentMaster();
    helperDebugLog('subAgent.target', {
      requestedTarget: normalizedOptions.target ?? null,
      resolvedTarget: target,
      master,
    });
    const response = await invokeAcpSubAgent({
      prompt: prompt.trim(),
      options: normalizedOptions,
      master,
      target,
      allowedReadRoots: Array.isArray(helperContext.readAccessRoots)
        ? helperContext.readAccessRoots
        : [],
      helperDebugLog,
    }).catch(error => {
      // Only ACP protocol failures fall back to the legacy sub-agent. A damaged
      // install (MissingAcpAdapterAssetsError) is not one of them: its message
      // names the repair, and swapping in a different sub-agent implementation
      // would hide the fact that the install needs fixing.
      if (!isAcpInvokeError(error)) throw error;
      if (helperContext.acpOnly === true) throw error;
      helperDebugLog('subAgent.acp.fallback', {
        target,
        code: error.code,
        message: error.message,
      });
      return invokeLegacySubAgent({
        prompt: prompt.trim(),
        options: normalizedOptions,
        master,
        target,
        helperDebugLog,
      });
    });
    return logFilePath ? { ...response, logFilePath } : response;
  };

  Object.defineProperty(experimentalSubAgentImpl, 'schema', { value: experimentalSubAgentSchema });
  return experimentalSubAgentImpl;
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
      const responseMessage = Predicate.isRecord(parsed) ? parsed.message : undefined;
      const responseError = Predicate.isRecord(parsed) ? parsed.error : undefined;
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

  const experimentalSubAgentImpl = createExperimentalSubAgent({ helperContext, helperDebugLog });
  Reflect.set(globalThis, 'experimental_subAgent', experimentalSubAgentImpl);
  Reflect.set(globalThis, 'invokeAgent', experimentalSubAgentImpl);

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
