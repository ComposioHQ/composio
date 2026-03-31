import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import type { MasterKind } from 'src/services/master-detector';
import { isAcpInvokeError } from 'src/services/run-subagent-shared';
import { invokeAcpSubAgent } from 'src/services/run-subagent-acp';
import { invokeLegacySubAgent } from 'src/services/run-subagent-legacy';

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
};

type RunHelpersInstallParams = {
  readonly cliPrefix: ReadonlyArray<string>;
  readonly helperContext?: RunHelperContext;
};

type RunCliResult =
  | undefined
  | string
  | number
  | boolean
  | {
      readonly successful?: boolean;
      readonly storedInFile?: boolean;
      readonly outputFilePath?: string | null;
      readonly tokenCount?: number | null;
      readonly error?: string | null;
      readonly data?: unknown;
      readonly [key: string]: unknown;
    };

type PromptableResult = {
  readonly prompt?: () => string;
  readonly data?: unknown;
  readonly [key: string]: unknown;
};

type StructuredSchemaInput =
  | {
      readonly safeParse?: (value: unknown) => unknown;
      readonly _def?: unknown;
    }
  | Record<string, unknown>;

type NormalizedInvokeAgentOptions = {
  readonly target?: string;
  readonly model?: string;
  readonly schema?: StructuredSchemaInput;
  readonly jsonSchema?: Record<string, unknown>;
  readonly structuredSchema?: Record<string, unknown>;
  readonly zodSchema?: StructuredSchemaInput;
};

type RunGlobalScope = typeof globalThis & {
  z: typeof z;
  zod: typeof z;
  search: (query: string, options?: Record<string, unknown>) => Promise<RunCliResult>;
  execute: (slug: string, data?: unknown) => Promise<RunCliResult>;
  experimental_subAgent: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
  invokeAgent: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
  proxy: (
    toolkit: string
  ) => Promise<(input: string | URL, init?: RequestInit) => Promise<Response>>;
  __composioRunContext: {
    readonly outputDir: string | null;
    readonly logFilePath: string | null;
  };
  __composioConsumerContext: RunHelperContext;
};

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
} as const;

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
} as const;

const runGlobals = globalThis as RunGlobalScope;

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

// eslint-disable-next-line max-lines-per-function
export const installRunHelpers = async ({
  cliPrefix,
  helperContext = {},
}: RunHelpersInstallParams): Promise<void> => {
  runGlobals.z = z;
  runGlobals.zod = z;

  const perfDebugEnabled =
    helperContext.perfDebug === true || process.env.COMPOSIO_PERF_DEBUG === '1';
  const toolDebugEnabled =
    helperContext.toolDebug === true || process.env.COMPOSIO_TOOL_DEBUG === '1';
  const perfDebugStart = Date.now();
  let perfDebugSeq = 0;
  const executeId = () => crypto.randomUUID().slice(0, 8);
  const proxySessionCache = new Map<string, string>();
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

  const appendRunLogLine = (line: string) => {
    if (!sharedRunLogFilePath || line.length === 0) return;
    fs.appendFileSync(sharedRunLogFilePath, `${line}\n`, 'utf8');
  };

  const perfDebugLog = (phase: string, label: string, details: Record<string, unknown> = {}) => {
    if (!perfDebugEnabled) return;
    const elapsedMs = Date.now() - perfDebugStart;
    const payload = { phase, label, elapsedMs, ...details };
    // eslint-disable-next-line no-console
    console.error(`[perf] ${JSON.stringify(payload)}`);
  };

  const truncateDebugText = (value: unknown, max = 240) => {
    const text = typeof value === 'string' ? value : String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  const previewDebugValue = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'string') return truncateDebugText(value.replace(/\s+/g, ' ').trim());
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferred = ['message', 'error', 'title', 'summary', 'brief', 'status'];
      for (const key of preferred) {
        if (typeof record[key] === 'string' && record[key].trim().length > 0) {
          return truncateDebugText(record[key].trim());
        }
      }
      return `object{${Object.keys(record).slice(0, 4).join(', ')}}`;
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
          ? (details.entries as Array<{ status?: string; content?: string }>)
          : [];
        if (entries.length === 0) return '[experimental_subAgent:plan] updated';
        const summary = entries
          .slice(0, 3)
          .map(entry => `${entry.status}:${truncateDebugText(entry.content || '', 48)}`)
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

  const helperDebugLog = (step: string, details: Record<string, unknown> = {}) => {
    const line = formatHelperDebugEvent(step, details);
    const elapsedMs = Date.now() - perfDebugStart;
    appendRunLogLine(line ?? `[run:debug] ${JSON.stringify({ step, elapsedMs, ...details })}`);
  };

  const parseJson = (text: string): unknown => {
    const value = text.trim();
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const stringifyForPrompt = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const attachPromptMethod = <T>(value: T): T => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const promptable = value as PromptableResult;
    if (typeof promptable.prompt === 'function') return value;
    Object.defineProperty(promptable, 'prompt', {
      value: () => stringifyForPrompt('data' in promptable ? promptable.data : promptable),
      enumerable: false,
    });
    return value;
  };

  const isPlainObjectForExecute = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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

  const writeTempExecuteFile = async (value: unknown): Promise<unknown> => {
    const outputDir = sharedRunOutputDir || path.join(os.tmpdir(), 'composio-run-files');
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

  const maybeLoadStoredCliResult = (result: RunCliResult): RunCliResult => {
    if (!result || typeof result !== 'object' || result.storedInFile !== true) {
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

  const describeDebugValue = (value: unknown) => {
    if (Array.isArray(value)) return { type: 'array', length: value.length };
    if (value && typeof value === 'object') {
      return { type: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 20) };
    }
    return {
      type: typeof value,
      value: typeof value === 'string' ? value.slice(0, 200) : (value ?? null),
    };
  };

  const summarizeCliResultPreview = (result: RunCliResult): unknown => {
    if (result == null || typeof result !== 'object') return result;
    if ('data' in result && result.data !== undefined) return result.data;
    if (typeof result.error === 'string' && result.error.trim().length > 0)
      return result.error.trim();
    return result;
  };

  const logCliResultPreview = (
    requestId: string,
    command: string | undefined,
    result: RunCliResult
  ) => {
    if (!result || typeof result !== 'object') {
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

  const detectInvokeAgentMaster = (): MasterKind | 'user' => {
    if (
      helperContext.master === 'claude' ||
      helperContext.master === 'codex' ||
      helperContext.master === 'user'
    ) {
      return helperContext.master;
    }
    const envKeys = Object.keys(process.env || {});
    if (envKeys.some(key => key.startsWith('CODEX_'))) return 'codex';
    if (envKeys.some(key => key.startsWith('CLAUDE_'))) return 'claude';
    return 'user';
  };

  const resolveInvokeAgentTarget = (requestedTarget?: string): 'claude' | 'codex' => {
    if (requestedTarget === 'claude' || requestedTarget === 'codex') return requestedTarget;
    const detected = requestedTarget === 'user' ? 'user' : detectInvokeAgentMaster();
    if (detected === 'codex' || detected === 'claude') return detected;
    if (typeof Bun.which === 'function' && Bun.which('codex')) return 'codex';
    if (typeof Bun.which === 'function' && Bun.which('claude')) return 'claude';
    throw new Error(
      'experimental_subAgent() could not determine an agent CLI. Current master is user; install codex or claude, or pass { target: "codex" | "claude" }.'
    );
  };

  const normalizeInvokeAgentOptions = (
    options: Record<string, unknown> = {}
  ): NormalizedInvokeAgentOptions => {
    if (options == null || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('experimental_subAgent() options must be an object when provided.');
    }
    if (options.schema !== undefined && options.jsonSchema !== undefined) {
      throw new Error(
        'experimental_subAgent() accepts either options.schema or options.jsonSchema, not both.'
      );
    }
    const inputSchema = (options.schema ?? options.jsonSchema) as StructuredSchemaInput | undefined;
    let structuredSchema: Record<string, unknown> | undefined;
    let zodSchema: StructuredSchemaInput | undefined;
    if (inputSchema !== undefined) {
      if (
        typeof inputSchema === 'object' &&
        inputSchema !== null &&
        'safeParse' in inputSchema &&
        typeof inputSchema.safeParse === 'function' &&
        '_def' in inputSchema
      ) {
        if (typeof z.toJSONSchema !== 'function') {
          throw new Error(
            'experimental_subAgent() requires Zod 4 with z.toJSONSchema() when using options.schema.'
          );
        }
        zodSchema = inputSchema;
        structuredSchema = z.toJSONSchema(inputSchema as never) as Record<string, unknown>;
      } else if (
        typeof inputSchema === 'object' &&
        inputSchema !== null &&
        !Array.isArray(inputSchema)
      ) {
        structuredSchema = inputSchema;
      } else {
        throw new Error(
          'experimental_subAgent() schema must be a Zod schema or JSON Schema object.'
        );
      }
    }
    return { ...options, structuredSchema, zodSchema };
  };

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

  const normalizeProxyToolkit = (toolkit: string) => {
    if (typeof toolkit !== 'string' || toolkit.trim().length === 0) {
      throw new Error('proxy() requires a non-empty toolkit string.');
    }
    return toolkit.trim();
  };

  const normalizeFetchHeaders = (headers: HeadersInit | undefined) => {
    if (!headers) return [];
    return [...(new Headers(headers) as unknown as Iterable<[string, string]>)].map(
      ([name, value]) => ({
        name,
        type: 'header',
        value,
      })
    );
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
      const detail =
        typeof parsed === 'string'
          ? parsed
          : (((parsed as { message?: string; error?: string } | undefined)?.message ||
              (parsed as { message?: string; error?: string } | undefined)?.error ||
              raw.trim()) ??
            undefined);
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
    const created = (await fetchComposioJson('/api/v3/tool_router/session', {
      user_id: auth.userId,
      manage_connections: { enable: false },
      toolkits: { enable: [toolkit] },
    })) as { session_id?: string };
    const sessionId = created?.session_id;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new Error('Composio proxy session creation returned no session_id.');
    }
    proxySessionCache.set(toolkit, sessionId);
    return sessionId;
  };

  const runCliJson = async (args: ReadonlyArray<string>): Promise<RunCliResult> => {
    const requestId = `${args[0] ?? 'cli'}#${++perfDebugSeq}`;
    helperDebugLog('cli.start', { requestId, args });
    const env = {
      ...process.env,
      ...(helperContext.apiKey ? { COMPOSIO_USER_API_KEY: helperContext.apiKey } : {}),
      ...(helperContext.baseURL ? { COMPOSIO_BASE_URL: helperContext.baseURL } : {}),
      ...(helperContext.webURL ? { COMPOSIO_WEB_URL: helperContext.webURL } : {}),
      COMPOSIO_CLI_INVOCATION_ORIGIN: 'run',
      ...(helperContext.runId ? { COMPOSIO_CLI_PARENT_RUN_ID: helperContext.runId } : {}),
      ...(sharedRunOutputDir ? { COMPOSIO_RUN_OUTPUT_DIR: sharedRunOutputDir } : {}),
      ...(perfDebugEnabled ? { COMPOSIO_PERF_DEBUG: '1' } : {}),
      ...(toolDebugEnabled ? { COMPOSIO_TOOL_DEBUG: '1' } : {}),
    };
    delete (env as Record<string, string | undefined>).BUN_BE_BUN;
    perfDebugLog('start', requestId, { cmd: args });
    const child = Bun.spawn({
      cmd: [...cliPrefix, ...args],
      env,
      stdio: ['inherit', 'pipe', perfDebugEnabled || toolDebugEnabled ? 'inherit' : 'pipe'],
    });
    const stdout = child.stdout ? await new Response(child.stdout).text() : '';
    const stderr = child.stderr ? await new Response(child.stderr).text() : '';
    const result = maybeLoadStoredCliResult(parseJson(stdout) as RunCliResult);
    const exitCode = await child.exited;
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

  runGlobals.search = async (query, options = {}) => {
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

  runGlobals.execute = async (slug, data = {}) => {
    helperDebugLog('execute.prepare', { slug, hasData: data !== undefined });
    const args = ['execute', slug];
    if (helperContext.dryRun === true) args.push('--dry-run');
    if (helperContext.skipConnectionCheck === true) args.push('--skip-connection-check');
    if (helperContext.skipToolParamsCheck === true) args.push('--skip-tool-params-check');
    if (helperContext.skipChecks === true) args.push('--skip-checks');
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
    if (result && typeof result === 'object' && result.successful === false) {
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
    try {
      const response = await invokeAcpSubAgent({
        prompt: prompt.trim(),
        options:
          normalizedOptions as import('src/services/run-subagent-shared').InvokeAgentNormalizedOptions,
        master,
        target,
        allowedReadRoots: Array.isArray(helperContext.readAccessRoots)
          ? helperContext.readAccessRoots
          : [],
        helperDebugLog,
      });
      return logFilePath ? { ...response, logFilePath } : response;
    } catch (error) {
      if (!isAcpInvokeError(error)) throw error;
      if (helperContext.acpOnly === true) throw error;
      helperDebugLog('subAgent.acp.fallback', {
        target,
        code: error.code,
        message: error.message,
      });
      const response = await invokeLegacySubAgent({
        prompt: prompt.trim(),
        options:
          normalizedOptions as import('src/services/run-subagent-shared').InvokeAgentNormalizedOptions,
        master,
        target,
        helperDebugLog,
      });
      return logFilePath ? { ...response, logFilePath } : response;
    }
  };

  runGlobals.experimental_subAgent = experimentalSubAgentImpl;
  Object.defineProperty(runGlobals.experimental_subAgent, 'schema', {
    value: experimentalSubAgentSchema,
  });
  runGlobals.invokeAgent = experimentalSubAgentImpl;
  Object.defineProperty(runGlobals.invokeAgent, 'schema', { value: experimentalSubAgentSchema });

  const toProxyResponse = async (result: {
    readonly headers?: Record<string, string>;
    readonly binary_data?: { readonly url?: string };
    readonly data?: unknown;
    readonly status?: number;
  }) => {
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
    if (!headers.has('content-type'))
      headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(result.data), { status: result.status ?? 200, headers });
  };

  runGlobals.proxy = async (toolkit: string) => {
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
      const result = (await fetchComposioJson(
        `/api/v3/tool_router/session/${sessionId}/proxy_execute`,
        {
          toolkit_slug: normalizedToolkit,
          endpoint: request.endpoint,
          method: request.method,
          ...(request.body !== undefined ? { body: request.body } : {}),
          ...(request.parameters.length > 0
            ? {
                parameters: request.parameters.map(
                  (parameter: { name: string; type: string; value: string }) => ({
                    name: parameter.name,
                    type: parameter.type,
                    value: String(parameter.value),
                  })
                ),
              }
            : {}),
        }
      )) as {
        readonly headers?: Record<string, string>;
        readonly binary_data?: { readonly url?: string };
        readonly data?: unknown;
        readonly status?: number;
      };
      return toProxyResponse(result);
    };
    Object.defineProperty(proxyFetch, 'toolkit', { value: normalizedToolkit });
    return proxyFetch;
  };
  Object.defineProperty(runGlobals.proxy, 'schema', { value: proxySchema });

  Object.defineProperty(runGlobals, '__composioRunContext', {
    value: Object.freeze({
      outputDir: sharedRunOutputDir,
      logFilePath: sharedRunLogFilePath,
    }),
    configurable: true,
  });

  Object.defineProperty(runGlobals, '__composioConsumerContext', {
    value: helperContext,
    configurable: true,
  });
};
