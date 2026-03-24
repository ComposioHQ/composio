import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ts } from 'ts-morph';
import { resolveCommandProject } from 'src/services/command-project';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import { isPerfDebugEnabled, isToolDebugEnabled } from 'src/services/runtime-debug-flags';

const file = Options.text('file').pipe(
  Options.withAlias('f'),
  Options.withDescription('Run a TS/JS file instead of inline code'),
  Options.optional
);

const dryRun = Options.boolean('dry-run').pipe(Options.withDefault(false));
const skipConnectionCheck = Options.boolean('skip-connection-check').pipe(
  Options.withDefault(false)
);
const skipToolParamsCheck = Options.boolean('skip-tool-params-check').pipe(
  Options.withDefault(false)
);
const noVerify = Options.boolean('no-verify').pipe(Options.withDefault(false));

const args = Args.repeated(Args.text({ name: 'arg' })).pipe(
  Args.withDescription('Inline code followed by arguments, or just arguments when using --file')
);

const withArgDelimiter = (args: ReadonlyArray<string>) => (args.length > 0 ? ['--', ...args] : []);

export const extractInlineExecuteToolSlugs = (source: string): ReadonlyArray<string> => {
  if (!source.trim()) {
    return [];
  }

  const parsed = ts.createSourceFile(
    'composio-run-inline.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const slugs = new Set<string>();

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'execute'
    ) {
      const [slugArg] = node.arguments;
      if (slugArg && ts.isStringLiteralLike(slugArg)) {
        slugs.add(slugArg.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return [...slugs];
};

export const inferCliInvocationPrefix = (
  argv: ReadonlyArray<string> = process.argv
): ReadonlyArray<string> => {
  const entrypoint = argv[1];
  if (!entrypoint) {
    return [process.execPath];
  }

  // Compiled Bun binaries report an internal $bunfs entrypoint which cannot be
  // re-executed as a real filesystem path. In that case the binary itself is
  // the CLI entrypoint.
  if (entrypoint.startsWith('/$bunfs/')) {
    return [process.execPath];
  }

  const resolvedEntrypoint = path.resolve(entrypoint);
  return fs.existsSync(resolvedEntrypoint)
    ? [process.execPath, resolvedEntrypoint]
    : [process.execPath];
};

type RunHelperContext = {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly webURL?: string;
  readonly orgId?: string;
  readonly consumerUserId?: string;
  readonly consumerProjectId?: string;
  readonly consumerProjectName?: string;
  readonly perfDebug?: boolean;
  readonly toolDebug?: boolean;
  readonly dryRun?: boolean;
  readonly skipConnectionCheck?: boolean;
  readonly skipToolParamsCheck?: boolean;
  readonly noVerify?: boolean;
};

const buildRunBaseHelpersSource = (): ReadonlyArray<string> => [
  'const perfDebugEnabled = helperContext.perfDebug === true || process.env.COMPOSIO_PERF_DEBUG === "1";',
  'const toolDebugEnabled = helperContext.toolDebug === true || process.env.COMPOSIO_TOOL_DEBUG === "1";',
  'const perfDebugStart = Date.now();',
  'let perfDebugSeq = 0;',
  'const proxySessionCache = new Map();',
  'const composioBaseURL = (helperContext.baseURL || "https://backend.composio.dev").replace(/\\/$/, "");',
  'const proxySchema = {',
  '  type: "function",',
  '  description: "Call proxy(toolkit) to get a fetch-compatible function bound to that toolkit\'s connected account.",',
  '  parameters: {',
  '    type: "object",',
  '    additionalProperties: false,',
  '    required: ["toolkit"],',
  '    properties: {',
  '      toolkit: { type: "string", description: "Toolkit slug whose connected account should be used" },',
  '    },',
  '  },',
  '  returns: {',
  '    type: "function",',
  '    signature: "fetch(input, init?) => Promise<Response>",',
  '    requestInit: {',
  '      type: "object",',
  '      additionalProperties: true,',
  '      properties: {',
  '        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },',
  '        headers: { description: "Standard fetch headers init" },',
  '        body: { description: "String, JSON-ish value, Blob, ArrayBuffer, or Uint8Array" },',
  '      },',
  '    },',
  '  },',
  '};',
  'const perfDebugLog = (phase, label, details = {}) => {',
  '  if (!perfDebugEnabled) return;',
  '  const elapsedMs = Date.now() - perfDebugStart;',
  '  const payload = { phase, label, elapsedMs, ...details };',
  '  console.error(`[perf] ${JSON.stringify(payload)}`);',
  '};',
  'const parseJson = (text) => {',
  '  const value = text.trim();',
  '  if (!value) return undefined;',
  '  try {',
  '    return JSON.parse(value);',
  '  } catch {',
  '    return value;',
  '  }',
  '};',
  'const requireConsumerProxyContext = () => {',
  '  if (!helperContext.apiKey) {',
  '    throw new Error("proxy() requires an authenticated Composio user session.");',
  '  }',
  '  if (!helperContext.orgId || !helperContext.consumerProjectId || !helperContext.consumerUserId) {',
  '    throw new Error("proxy() requires a consumer project context so it can use the consumer project credentials.");',
  '  }',
  '  return {',
  '    apiKey: helperContext.apiKey,',
  '    orgId: helperContext.orgId,',
  '    projectId: helperContext.consumerProjectId,',
  '    userId: helperContext.consumerUserId,',
  '  };',
  '};',
  'const normalizeProxyToolkit = (toolkit) => {',
  '  if (typeof toolkit !== "string" || toolkit.trim().length === 0) {',
  '    throw new Error("proxy() requires a non-empty toolkit string.");',
  '  }',
  '  return toolkit.trim();',
  '};',
  'const normalizeFetchHeaders = (headers) => {',
  '  if (!headers) return [];',
  '  return Array.from(new Headers(headers).entries()).map(([name, value]) => ({',
  '    name,',
  '    type: "header",',
  '    value,',
  '  }));',
  '};',
  'const normalizeFetchBody = async (body) => {',
  '  if (body === undefined || body === null) return undefined;',
  '  if (typeof body === "string") return body;',
  '  if (typeof body === "number" || typeof body === "boolean") return body;',
  '  if (typeof Blob !== "undefined" && body instanceof Blob) {',
  '    return await body.text();',
  '  }',
  '  if (body instanceof ArrayBuffer) {',
  '    return Buffer.from(body).toString("base64");',
  '  }',
  '  if (ArrayBuffer.isView(body)) {',
  '    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("base64");',
  '  }',
  '  return body;',
  '};',
  'const normalizeFetchInput = async (input, init = {}) => {',
  '  if (typeof Request !== "undefined" && input instanceof Request) {',
  '    throw new Error("proxy() does not support passing a Request instance yet. Pass a URL string and init instead.");',
  '  }',
  '  const endpoint = input instanceof URL ? input.toString() : input;',
  '  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {',
  '    throw new Error("proxy fetch requires a non-empty URL string or URL object.");',
  '  }',
  '  const method = typeof init.method === "string" ? init.method.toUpperCase() : "GET";',
  '  if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {',
  '    throw new Error("proxy fetch only supports GET, POST, PUT, DELETE, PATCH.");',
  '  }',
  '  return {',
  '    endpoint: endpoint.trim(),',
  '    method,',
  '    parameters: normalizeFetchHeaders(init.headers),',
  '    body: await normalizeFetchBody(init.body),',
  '  };',
  '};',
  'const fetchComposioJson = async (pathname, body) => {',
  '  const auth = requireConsumerProxyContext();',
  '  const response = await fetch(`${composioBaseURL}${pathname}`, {',
  '    method: "POST",',
  '    headers: {',
  '      "content-type": "application/json",',
  '      "x-user-api-key": auth.apiKey,',
  '      "x-org-id": auth.orgId,',
  '      "x-project-id": auth.projectId,',
  '    },',
  '    body: JSON.stringify(body),',
  '  });',
  '  const raw = await response.text();',
  '  const parsed = parseJson(raw);',
  '  if (!response.ok) {',
  '    const detail = typeof parsed === "string" ? parsed : (parsed?.message || parsed?.error || raw.trim() || undefined);',
  '    const error = new Error(`Composio proxy request failed with status ${response.status}${detail ? `: ${detail}` : ""}`);',
  '    Object.assign(error, { status: response.status, response: parsed ?? raw });',
  '    throw error;',
  '  }',
  '  return parsed;',
  '};',
  'const getProxySessionId = async (toolkit) => {',
  '  const cached = proxySessionCache.get(toolkit);',
  '  if (cached) return cached;',
  '  const auth = requireConsumerProxyContext();',
  '  const created = await fetchComposioJson("/api/v3/tool_router/session", {',
  '    user_id: auth.userId,',
  '    manage_connections: { enable: false },',
  '    toolkits: { enable: [toolkit] },',
  '  });',
  '  const sessionId = created?.session_id;',
  '  if (typeof sessionId !== "string" || sessionId.length === 0) {',
  '    throw new Error("Composio proxy session creation returned no session_id.");',
  '  }',
  '  proxySessionCache.set(toolkit, sessionId);',
  '  return sessionId;',
  '};',
  '',
  'const runCliJson = async (args) => {',
  '  const requestId = `${args[0] ?? "cli"}#${++perfDebugSeq}`;',
  '  const env = {',
  '    ...process.env,',
  '    ...(helperContext.apiKey ? { COMPOSIO_USER_API_KEY: helperContext.apiKey } : {}),',
  '    ...(helperContext.baseURL ? { COMPOSIO_BASE_URL: helperContext.baseURL } : {}),',
  '    ...(helperContext.webURL ? { COMPOSIO_WEB_URL: helperContext.webURL } : {}),',
  '    ...(perfDebugEnabled ? { COMPOSIO_PERF_DEBUG: "1" } : {}),',
  '    ...(toolDebugEnabled ? { COMPOSIO_TOOL_DEBUG: "1" } : {}),',
  '  };',
  '  delete env.BUN_BE_BUN;',
  '  perfDebugLog("start", requestId, { cmd: args });',
  '  const child = Bun.spawn({',
  '    cmd: [...cliPrefix, ...args],',
  '    env,',
  "    stdio: ['inherit', 'pipe', perfDebugEnabled || toolDebugEnabled ? 'inherit' : 'pipe'],",
  '  });',
  '  const stdout = child.stdout ? await new Response(child.stdout).text() : "";',
  '  const stderr = child.stderr ? await new Response(child.stderr).text() : "";',
  '  const result = parseJson(stdout);',
  '  const exitCode = await child.exited;',
  '  if (exitCode !== 0) {',
  '    perfDebugLog("error", requestId, { exitCode, stderr: stderr.trim() || undefined });',
  '    const error = new Error(`composio ${args.join(" ")} failed with exit code ${exitCode}`);',
  '    Object.assign(error, { exitCode, result, stderr: stderr.trim() || undefined });',
  '    throw error;',
  '  }',
  '  if (result === undefined) {',
  '    const details = stderr.trim();',
  '    const suffix = details ? `: ${details}` : "";',
  '    perfDebugLog("error", requestId, { exitCode, stderr: details || undefined, noJson: true });',
  '    const error = new Error(`composio ${args.join(" ")} returned no JSON output${suffix}`);',
  '    Object.assign(error, { exitCode, result, stderr: details || undefined });',
  '    throw error;',
  '  }',
  '  perfDebugLog("end", requestId, { exitCode, stdoutBytes: stdout.length, stderrBytes: stderr.length });',
  '  return result;',
  '};',
  '',
  'globalThis.search = async (query, options = {}) => {',
  '  const args = ["search", query];',
  '  if (Array.isArray(options.toolkits) && options.toolkits.length > 0) {',
  '    args.push("--toolkits", options.toolkits.join(","));',
  '  } else if (typeof options.toolkits === "string" && options.toolkits.trim().length > 0) {',
  '    args.push("--toolkits", options.toolkits);',
  '  }',
  '  if (typeof options.limit === "number") {',
  '    args.push("--limit", String(options.limit));',
  '  }',
  '  return runCliJson(args);',
  '};',
  '',
  'globalThis.execute = async (slug, data = {}) => {',
  '  const args = ["execute", slug];',
  '  if (helperContext.dryRun === true) {',
  '    args.push("--dry-run");',
  '  }',
  '  if (helperContext.skipConnectionCheck === true) {',
  '    args.push("--skip-connection-check");',
  '  }',
  '  if (helperContext.skipToolParamsCheck === true) {',
  '    args.push("--skip-tool-params-check");',
  '  }',
  '  if (helperContext.noVerify === true) {',
  '    args.push("--no-verify");',
  '  }',
  '  if (data !== undefined) {',
  '    const serialized = typeof data === "string" ? data : JSON.stringify(data);',
  '    args.push("--data", serialized);',
  '  }',
  '  return runCliJson(args);',
  '};',
  '',
];

const buildRunProxyHelpersSource = (): ReadonlyArray<string> => [
  'const toProxyResponse = async (result) => {',
  '  const headers = new Headers(result?.headers || {});',
  '  if (result?.binary_data?.url) {',
  '    const binaryResponse = await fetch(result.binary_data.url);',
  '    binaryResponse.headers.forEach((value, key) => {',
  '      if (!headers.has(key)) headers.set(key, value);',
  '    });',
  '    return new Response(binaryResponse.body, {',
  '      status: result.status ?? binaryResponse.status,',
  '      headers,',
  '    });',
  '  }',
  '  if (result?.data === undefined || result?.data === null) {',
  '    return new Response(null, { status: result?.status ?? 200, headers });',
  '  }',
  '  if (typeof result.data === "string") {',
  '    if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");',
  '    return new Response(result.data, { status: result.status ?? 200, headers });',
  '  }',
  '  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");',
  '  return new Response(JSON.stringify(result.data), { status: result.status ?? 200, headers });',
  '};',
  'globalThis.proxy = async (toolkit) => {',
  '  const normalizedToolkit = normalizeProxyToolkit(toolkit);',
  '  const sessionId = await getProxySessionId(normalizedToolkit);',
  '  const proxyFetch = async (input, init = {}) => {',
  '    const request = await normalizeFetchInput(input, init);',
  '    const result = await fetchComposioJson(`/api/v3/tool_router/session/${sessionId}/proxy_execute`, {',
  '      toolkit_slug: normalizedToolkit,',
  '      endpoint: request.endpoint,',
  '      method: request.method,',
  '      ...(request.body !== undefined ? { body: request.body } : {}),',
  '      ...(request.parameters?.length',
  '      ? {',
  '          parameters: request.parameters.map((parameter) => ({',
  '            name: parameter.name,',
  '            type: parameter.type,',
  '            value: String(parameter.value),',
  '          })),',
  '        }',
  '      : {}),',
  '    });',
  '    return toProxyResponse(result);',
  '  };',
  '  Object.defineProperty(proxyFetch, "toolkit", { value: normalizedToolkit });',
  '  return proxyFetch;',
  '};',
  'Object.defineProperty(globalThis.proxy, "schema", { value: proxySchema });',
  '',
  'Object.defineProperty(globalThis, "__composioConsumerContext", {',
  '  value: helperContext,',
  '  configurable: true,',
  '});',
  '',
];

export const buildRunHelpersSource = (
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext = {}
): string =>
  [
    `const cliPrefix = ${JSON.stringify(cliPrefix)};`,
    `const helperContext = ${JSON.stringify(context)};`,
    '',
    ...buildRunBaseHelpersSource(),
    ...buildRunProxyHelpersSource(),
  ].join('\n');

const createRunHelpersPreloadFile = (
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext
) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-'));
  const preloadPath = path.join(directory, 'globals.mjs');
  fs.writeFileSync(preloadPath, buildRunHelpersSource(cliPrefix, context), 'utf8');
  return { directory, preloadPath };
};

export const buildRunCommand = ({
  file,
  args,
  preloadPath,
}: {
  file: Option.Option<string>;
  args: ReadonlyArray<string>;
  preloadPath: string;
}) => {
  const base = [process.execPath, '--preload', preloadPath];
  if (Option.isSome(file)) {
    return [...base, 'run', file.value, ...withArgDelimiter(args)];
  }

  const [inlineCode, ...scriptArgs] = args;
  if (inlineCode) {
    return [...base, '--eval', inlineCode, ...withArgDelimiter(scriptArgs)];
  }

  throw new Error('Provide inline code or use --file to run a script file.');
};

const resolveRunHelperContext = () =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);
    const orgId = Option.getOrUndefined(userContext.data.orgId);
    const baseContext = {
      apiKey,
      baseURL: userContext.data.baseURL,
      webURL: userContext.data.webURL,
      orgId,
    } satisfies RunHelperContext;

    if (!apiKey || !orgId) {
      return baseContext;
    }

    const consumerProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(Effect.option);
    if (Option.isNone(consumerProject) || consumerProject.value.projectType !== 'CONSUMER') {
      return baseContext;
    }

    return {
      ...baseContext,
      consumerUserId: consumerProject.value.consumerUserId,
      consumerProjectId: consumerProject.value.projectId,
      consumerProjectName: consumerProject.value.projectName,
    } satisfies RunHelperContext;
  });

export const runCmd = Command.make('run', {
  file,
  dryRun,
  skipConnectionCheck,
  skipToolParamsCheck,
  noVerify,
  args,
}).pipe(
  Command.withDescription(
    [
      'Run inline TS/JS code or a file with the embedded Bun runtime and injected Composio helpers: `execute`, `search`, and `proxy`.',
      'Use this for programmatic multi-step tool workflows when you want to stay in code and not orchestrate everything through bash.',
      '',
      'Usage:',
      "  composio run '<code>' [-- ...args]",
      '  composio run --file ./script.ts [-- ...args]',
      '',
      'Examples:',
      `  composio run 'const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "acme", repo: "app", title: "Bug report" }); console.log(issue)'`,
      `  composio run --skip-connection-check 'const email = await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" }); console.log(email)'`,
      `  composio run --skip-tool-params-check 'const email = await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" }); console.log(email)'`,
      `  composio run --no-verify 'const email = await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" }); console.log(email)'`,
      `  composio run --dry-run 'const email = await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" }); console.log(email)'`,
      '  composio run --file ./script.ts -- hello world',
      '',
      'Injected globals:',
      '  await execute(slug, data?)',
      '    Primary helper. Wraps `composio execute` and returns parsed JSON output quickly.',
      '    It validates arguments against cached tool schemas in `~/.composio/tool_definitions/` when available.',
      '  await search(query, { toolkits?: string[] | string, limit?: number })',
      '    Secondary discovery helper. Wraps `composio search` and returns parsed JSON stdout.',
      '  const fetch = await proxy(toolkit)',
      "    Returns a fetch-compatible function bound to that toolkit. It creates or reuses a consumer-project-scoped tool-router session and calls Composio proxy execute with that consumer project's credentials.",
      '    Example: `const gmailFetch = await proxy("gmail"); const res = await gmailFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile")`.',
      '    Inspect `proxy.schema` in code for the basic factory schema.',
      '  All three helpers automatically reuse your top level auth state, using the toolkits and apps you have already authorized.',
      '',
      'Hints:',
      '  Use `composio search "<query>"` outside `run` to discover tool slugs before writing a script.',
      '  Use `composio link <toolkit>` outside `run` to authenticate apps up front before calling `execute(...)`.',
      '  Use `composio execute <slug> --get-schema` if you want to inspect tool inputs before scripting.',
      '  Use `await proxy("<toolkit>")` when you need raw toolkit API calls that should ride on the consumer project account instead of a tool schema.',
      '  Since execute responses are parsed back into code almost instantly, it is usually fine to just try `execute(...)` directly in a script.',
      '  Treat `run` as the place to compose many tool calls once discovery and auth are already handled.',
      '',
      'Advanced:',
      '  import { $ } from "bun"',
      '  await $`${process.execPath} manage toolkits list`',
    ].join('\n')
  ),
  Command.withHandler(
    ({ file, dryRun, skipConnectionCheck, skipToolParamsCheck, noVerify, args }) =>
      Effect.gen(function* () {
        const perfDebug = isPerfDebugEnabled();
        const toolDebug = isToolDebugEnabled();
        if (Option.isNone(file)) {
          const [inlineCode] = args;
          const preloadSlugs = extractInlineExecuteToolSlugs(inlineCode ?? '');
          if (preloadSlugs.length > 0) {
            yield* warmToolInputDefinitions(preloadSlugs).pipe(
              Effect.catchAll(() => Effect.void),
              Effect.forkDaemon
            );
          }
        }

        const preload = createRunHelpersPreloadFile(inferCliInvocationPrefix(), {
          ...(yield* resolveRunHelperContext()),
          perfDebug,
          toolDebug,
          dryRun,
          skipConnectionCheck,
          skipToolParamsCheck,
          noVerify,
        });
        try {
          const child = Bun.spawn({
            cmd: buildRunCommand({ file, args, preloadPath: preload.preloadPath }),
            env: {
              ...process.env,
              BUN_BE_BUN: '1',
              ...(perfDebug ? { COMPOSIO_PERF_DEBUG: '1' } : {}),
              ...(toolDebug ? { COMPOSIO_TOOL_DEBUG: '1' } : {}),
            },
            stdio: ['inherit', 'inherit', 'inherit'],
          });

          const exitCode = yield* Effect.promise(() => child.exited);
          fs.rmSync(preload.directory, { recursive: true, force: true });
          process.exit(exitCode);
        } finally {
          fs.rmSync(preload.directory, { recursive: true, force: true });
        }
      })
  )
);
