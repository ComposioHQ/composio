import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ts } from 'ts-morph';
import { APP_VERSION } from 'src/constants';
import { resolveCommandProject } from 'src/services/command-project';
import { warmToolInputDefinitions } from 'src/services/tool-input-validation';
import { ComposioUserContext } from 'src/services/user-context';
import { isPerfDebugEnabled, isToolDebugEnabled } from 'src/services/runtime-debug-flags';
import { detectMaster, type MasterKind } from 'src/services/master-detector';
import {
  repairMissingInstalledRunCompanionModules,
  resolveRunCompanionModulePath,
} from 'src/services/run-companion-modules';
import {
  appendCliSessionHistory,
  resolveCliSessionArtifacts,
} from 'src/services/cli-session-artifacts';

const file = Options.text('file').pipe(
  Options.withAlias('f'),
  Options.withDescription('Run a TS/JS file instead of inline code'),
  Options.optional
);

const dryRun = Options.boolean('dry-run').pipe(
  Options.withDescription('Preview execute() calls without running them'),
  Options.withDefault(false)
);
const debug = Options.boolean('debug').pipe(
  Options.withDescription('Log helper steps while the script runs'),
  Options.withDefault(false)
);
const logsOff = Options.boolean('logs-off').pipe(
  Options.withDescription('Hide the always-on subAgent streaming logs'),
  Options.withDefault(false)
);
const skipConnectionCheck = Options.boolean('skip-connection-check').pipe(
  Options.withDescription('Skip the connected-account check'),
  Options.withDefault(false)
);
const skipToolParamsCheck = Options.boolean('skip-tool-params-check').pipe(
  Options.withDescription('Skip input validation against cached schema'),
  Options.withDefault(false)
);
const skipChecks = Options.boolean('skip-checks').pipe(
  Options.withDescription('Skip both connection and input validation checks'),
  Options.withDefault(false)
);

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

export const wrapInlineCodeForRun = (source: string): string => {
  const parsed = ts.createSourceFile(
    'composio-run-inline.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statements = [...parsed.statements];
  if (statements.length === 0) {
    return source;
  }

  const lastStatement = statements.at(-1);
  if (!lastStatement || !ts.isExpressionStatement(lastStatement)) {
    return source;
  }

  const prefix = source.slice(0, lastStatement.getFullStart());
  const suffix = source.slice(lastStatement.getEnd());
  const expressionText = lastStatement.expression.getText(parsed);
  return `${prefix}return (${expressionText});${suffix}`;
};

export const wrapFileSourceForRun = (source: string): string => {
  const parsed = ts.createSourceFile(
    'composio-run-file.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const statements = [...parsed.statements];
  const firstNonImportIndex = statements.findIndex(statement => !ts.isImportDeclaration(statement));
  if (firstNonImportIndex === -1) {
    return source;
  }

  const bodyStart = statements[firstNonImportIndex]!.getFullStart();
  const importPrefix = source.slice(0, bodyStart);
  const body = source.slice(bodyStart);
  return [
    importPrefix,
    'const __composioResult = await (async () => {',
    wrapInlineCodeForRun(body),
    '})();',
    'if (__composioResult !== undefined) {',
    '  console.log(__composioResult);',
    '}',
    '',
  ].join('\n');
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

type RunHelperModuleUrls = {
  readonly subAgentSharedModuleUrl: string;
  readonly subAgentAcpModuleUrl: string;
  readonly subAgentLegacyModuleUrl: string;
};

const resolveRunHelperModuleUrls = (): RunHelperModuleUrls => ({
  subAgentSharedModuleUrl: pathToFileURL(
    resolveRunCompanionModulePath({
      callerImportMetaUrl: import.meta.url,
      execPath: process.execPath,
      relativeNoExtensionFromCaller: '../services/run-subagent-shared',
    })
  ).href,
  subAgentAcpModuleUrl: pathToFileURL(
    resolveRunCompanionModulePath({
      callerImportMetaUrl: import.meta.url,
      execPath: process.execPath,
      relativeNoExtensionFromCaller: '../services/run-subagent-acp',
    })
  ).href,
  subAgentLegacyModuleUrl: pathToFileURL(
    resolveRunCompanionModulePath({
      callerImportMetaUrl: import.meta.url,
      execPath: process.execPath,
      relativeNoExtensionFromCaller: '../services/run-subagent-legacy',
    })
  ).href,
});

type RunHelperContext = {
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
};

// eslint-disable-next-line max-lines-per-function
const buildRunBaseHelpersSource = (): ReadonlyArray<string> => [
  'globalThis.z = z;',
  'globalThis.zod = z;',
  'const perfDebugEnabled = helperContext.perfDebug === true || process.env.COMPOSIO_PERF_DEBUG === "1";',
  'const toolDebugEnabled = helperContext.toolDebug === true || process.env.COMPOSIO_TOOL_DEBUG === "1";',
  'const perfDebugStart = Date.now();',
  'let perfDebugSeq = 0;',
  'const proxySessionCache = new Map();',
  'const composioBaseURL = (helperContext.baseURL || "https://backend.composio.dev").replace(/\\/$/, "");',
  'const subAgentSchema = {',
  '  type: "function",',
  '  description: "Prompt a sub-agent from the same agent family as the current main agent (Codex -> Codex, Claude -> Claude) and return its final response.",',
  '  parameters: {',
  '    type: "object",',
  '    additionalProperties: false,',
  '    required: ["prompt"],',
  '    properties: {',
  '      prompt: { type: "string", description: "The prompt to send to the agent CLI." },',
  '      target: { type: "string", enum: ["claude", "codex", "user"], description: "Optional master override. Defaults to the detected current master." },',
  '      model: { type: "string", description: "Optional model override passed through to the agent CLI." },',
  '      schema: { description: "Optional structured-output schema. Accepts a Zod schema or raw JSON Schema object." },',
  '      jsonSchema: { description: "Optional JSON Schema requesting structured output from the agent." },',
  '    },',
  '  },',
  '  returns: {',
  '    type: "object",',
  '    additionalProperties: false,',
  '    required: ["master", "target", "result"],',
  '    properties: {',
  '      master: { type: "string", enum: ["claude", "codex", "user"] },',
  '      target: { type: "string", enum: ["claude", "codex"] },',
  '      result: { description: "Final plain-text result when available." },',
  '      structuredOutput: { description: "Structured output when jsonSchema was requested." },',
  '    },',
  '  },',
  '};',
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
  'const helperDebugEnabled = helperContext.debug === true;',
  'const helperProgressEnabled = helperContext.logsOff !== true;',
  'const sharedRunOutputDir = typeof helperContext.runOutputDir === "string" && helperContext.runOutputDir.length > 0 ? helperContext.runOutputDir : null;',
  'const helperProgressSteps = new Set([',
  '  "subAgent.target",',
  '  "subAgent.acp.message",',
  '  "subAgent.acp.thought",',
  '  "subAgent.acp.tool_call",',
  '  "subAgent.acp.tool_call_update",',
  '  "subAgent.acp.plan",',
  '  "subAgent.acp.fallback",',
  ']);',
  'const helperDebugUseColor = process.stderr?.isTTY === true && process.env.NO_COLOR !== "1";',
  'const helperDebugColorize = (line) => helperDebugUseColor ? `\\x1b[90m${line}\\x1b[0m` : line;',
  'const truncateDebugText = (value, max = 240) => {',
  '  const text = typeof value === "string" ? value : String(value ?? "");',
  '  return text.length > max ? `${text.slice(0, max - 1)}…` : text;',
  '};',
  'const previewDebugValue = (value) => {',
  '  if (value == null) return "";',
  '  if (typeof value === "string") return truncateDebugText(value.replace(/\\s+/g, " ").trim());',
  '  if (typeof value === "number" || typeof value === "boolean") return String(value);',
  '  if (Array.isArray(value)) return `array(${value.length})`;',
  '  if (typeof value === "object") {',
  '    const preferred = ["message", "error", "title", "summary", "brief", "status"];',
  '    for (const key of preferred) {',
  '      if (typeof value[key] === "string" && value[key].trim().length > 0) {',
  '        return truncateDebugText(value[key].trim());',
  '      }',
  '    }',
  '    return `object{${Object.keys(value).slice(0, 4).join(", ")}}`;',
  '  }',
  '  return truncateDebugText(String(value));',
  '};',
  'const formatHelperDebugEvent = (step, details = {}) => {',
  '  switch (step) {',
  '    case "subAgent.target":',
  '      return `[subAgent] triggered with ${details.resolvedTarget}`;',
  '    case "subAgent.acp.resolve":',
  '      return `[subAgent] ACP via ${details.source} (${details.target})`;',
  '    case "subAgent.acp.initialized":',
  '      return `[subAgent] ACP initialized (${details.target})`;',
  '    case "subAgent.acp.session":',
  '      return `[subAgent] session ready (${details.target})`;',
  '    case "subAgent.acp.model":',
  '      return details.applied === true',
  '        ? `[subAgent] model=${details.model}`',
  '        : `[subAgent] model unchanged (${details.model})`;',
  '    case "subAgent.acp.message": {',
  '      const text = previewDebugValue(details.text);',
  '      return text ? `[subAgent] ${text}` : null;',
  '    }',
  '    case "subAgent.acp.thought": {',
  '      const text = previewDebugValue(details.text);',
  '      return text ? `[subAgent:thinking] ${text}` : null;',
  '    }',
  '    case "subAgent.acp.tool_call": {',
  '      const where = Array.isArray(details.locations) && details.locations.length > 0 ? ` ${details.locations.slice(0, 2).join(", ")}` : "";',
  '      return `[subAgent:tool] ${details.status || "pending"} ${details.title || details.kind || "tool"}${where}`;',
  '    }',
  '    case "subAgent.acp.tool_call_update": {',
  '      const where = Array.isArray(details.locations) && details.locations.length > 0 ? ` ${details.locations.slice(0, 2).join(", ")}` : "";',
  '      const preview = previewDebugValue(details.rawOutput);',
  '      return `[subAgent:tool] ${details.status || "update"} ${details.title || details.toolCallId || details.kind || "tool"}${where}${preview ? ` -> ${preview}` : ""}`;',
  '    }',
  '    case "subAgent.acp.plan": {',
  '      const entries = Array.isArray(details.entries) ? details.entries : [];',
  '      if (entries.length === 0) return "[subAgent:plan] updated";',
  '      const summary = entries.slice(0, 3).map((entry) => `${entry.status}:${truncateDebugText(entry.content || "", 48)}`).join(" | ");',
  '      return `[subAgent:plan] ${summary}`;',
  '    }',
  '    case "subAgent.acp.fallback":',
  '      return `[subAgent] ACP fallback (${details.code})`;',
  '    case "execute.prepare":',
  '      return `[execute] ${details.slug}`;',
  '    case "search.prepare":',
  '      return `[search] ${truncateDebugText(details.query || "", 96)}`;',
  '    case "proxy.request":',
  '      return `[proxy] ${details.method} ${truncateDebugText(details.endpoint || "", 96)}`;',
  '    case "cli.result": {',
  '      const command = typeof details.command === "string" ? details.command : "cli";',
  '      const state = details.successful === false ? "failed" : "ok";',
  '      const preview = previewDebugValue(details.preview);',
  '      return `[${command}] ${state}${preview ? ` ${preview}` : ""}`;',
  '    }',
  '    case "cli.error": {',
  '      const command = typeof details.command === "string" ? details.command : "cli";',
  '      const stderr = previewDebugValue(details.stderr);',
  '      return `[${command}] failed${stderr ? ` ${stderr}` : ""}`;',
  '    }',
  '    default:',
  '      return null;',
  '  }',
  '};',
  'const helperDebugLog = (step, details = {}) => {',
  '  const line = formatHelperDebugEvent(step, details);',
  '  if (line && (helperDebugEnabled || (helperProgressEnabled && helperProgressSteps.has(step)))) {',
  '    console.error(helperDebugColorize(line));',
  '    return;',
  '  }',
  '  if (!helperDebugEnabled) return;',
  '  const elapsedMs = Date.now() - perfDebugStart;',
  '  console.error(helperDebugColorize(`[run:debug] ${JSON.stringify({ step, elapsedMs, ...details })}`));',
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
  'const stringifyForPrompt = (value) => {',
  '  if (value === undefined) return "undefined";',
  '  if (value === null) return "null";',
  '  if (typeof value === "string") return value;',
  '  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {',
  '    return String(value);',
  '  }',
  '  try {',
  '    return JSON.stringify(value, null, 2);',
  '  } catch {',
  '    return String(value);',
  '  }',
  '};',
  'const attachPromptMethod = (value) => {',
  '  if (!value || typeof value !== "object" || Array.isArray(value)) return value;',
  '  if (typeof value.prompt === "function") return value;',
  '  Object.defineProperty(value, "prompt", {',
  '    value: () => stringifyForPrompt("data" in value ? value.data : value),',
  '    enumerable: false,',
  '  });',
  '  return value;',
  '};',
  'const maybeLoadStoredCliResult = (result) => {',
  '  if (!result || typeof result !== "object" || result.storedInFile !== true) {',
  '    return attachPromptMethod(result);',
  '  }',
  '  helperDebugLog("cli.result.stored_in_file", { outputFilePath: result.outputFilePath ?? null, tokenCount: result.tokenCount ?? null });',
  '  const outputFilePath = typeof result.outputFilePath === "string" ? result.outputFilePath : null;',
  '  return attachPromptMethod({',
  '    ...result,',
  '    data: {',
  '      storedInFilePath: outputFilePath !== null,',
  '      outputFilePath,',
  '    },',
  '  });',
  '};',
  'const describeDebugValue = (value) => {',
  '  if (Array.isArray(value)) return { type: "array", length: value.length };',
  '  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 20) };',
  '  return { type: typeof value, value: typeof value === "string" ? value.slice(0, 200) : value ?? null };',
  '};',
  'const summarizeCliResultPreview = (result) => {',
  '  if (result == null) return null;',
  '  if (typeof result !== "object") return result;',
  '  if ("data" in result && result.data !== undefined) return result.data;',
  '  if ("error" in result && typeof result.error === "string" && result.error.trim().length > 0) return result.error.trim();',
  '  return result;',
  '};',
  'const logCliResultPreview = (requestId, command, result) => {',
  '  if (!helperDebugEnabled) return;',
  '  if (!result || typeof result !== "object") {',
  '    helperDebugLog("cli.result", { requestId, command, preview: result, result: describeDebugValue(result) });',
  '    return;',
  '  }',
  '  helperDebugLog("cli.result", {',
  '    requestId,',
  '    command,',
  '    successful: result.successful ?? null,',
  '    storedInFile: result.storedInFile ?? false,',
  '    outputFilePath: result.outputFilePath ?? null,',
  '    error: result.error ?? null,',
  '    topLevelKeys: Object.keys(result).slice(0, 20),',
  '    data: "data" in result ? describeDebugValue(result.data) : null,',
  '    preview: summarizeCliResultPreview(result),',
  '  });',
  '};',
  'const detectInvokeAgentMaster = () => {',
  '  if (helperContext.master === "claude" || helperContext.master === "codex" || helperContext.master === "user") {',
  '    return helperContext.master;',
  '  }',
  '  const envKeys = Object.keys(process.env || {});',
  '  if (envKeys.some((key) => key.startsWith("CODEX_"))) return "codex";',
  '  if (envKeys.some((key) => key.startsWith("CLAUDE_"))) return "claude";',
  '  return "user";',
  '};',
  'const resolveInvokeAgentTarget = (requestedTarget) => {',
  '  if (requestedTarget === "claude" || requestedTarget === "codex") return requestedTarget;',
  '  const detected = requestedTarget === "user" ? "user" : detectInvokeAgentMaster();',
  '  if (detected === "codex" || detected === "claude") return detected;',
  '  if (typeof Bun.which === "function" && Bun.which("codex")) return "codex";',
  '  if (typeof Bun.which === "function" && Bun.which("claude")) return "claude";',
  '  throw new Error("subAgent() could not determine an agent CLI. Current master is user; install codex or claude, or pass { target: \\"codex\\" | \\"claude\\" }.");',
  '};',
  'const normalizeInvokeAgentOptions = (options = {}) => {',
  '  if (options == null || typeof options !== "object" || Array.isArray(options)) {',
  '    throw new Error("subAgent() options must be an object when provided.");',
  '  }',
  '  if (options.schema !== undefined && options.jsonSchema !== undefined) {',
  '    throw new Error("subAgent() accepts either options.schema or options.jsonSchema, not both.");',
  '  }',
  '  const inputSchema = options.schema ?? options.jsonSchema;',
  '  let structuredSchema;',
  '  let zodSchema;',
  '  if (inputSchema !== undefined) {',
  '    if (inputSchema && typeof inputSchema.safeParse === "function" && inputSchema._def) {',
  '      if (typeof z.toJSONSchema !== "function") {',
  '        throw new Error("subAgent() requires Zod 4 with z.toJSONSchema() when using options.schema.");',
  '      }',
  '      zodSchema = inputSchema;',
  '      structuredSchema = z.toJSONSchema(inputSchema);',
  '    } else if (typeof inputSchema === "object" && inputSchema !== null && !Array.isArray(inputSchema)) {',
  '      structuredSchema = inputSchema;',
  '    } else {',
  '      throw new Error("subAgent() schema must be a Zod schema or JSON Schema object.");',
  '    }',
  '  }',
  '  return { ...options, structuredSchema, zodSchema };',
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
  '  helperDebugLog("cli.start", { requestId, args });',
  '  const env = {',
  '    ...process.env,',
  '    ...(helperContext.apiKey ? { COMPOSIO_USER_API_KEY: helperContext.apiKey } : {}),',
  '    ...(helperContext.baseURL ? { COMPOSIO_BASE_URL: helperContext.baseURL } : {}),',
  '    ...(helperContext.webURL ? { COMPOSIO_WEB_URL: helperContext.webURL } : {}),',
  '    COMPOSIO_CLI_INVOCATION_ORIGIN: "run",',
  '    ...(helperContext.runId ? { COMPOSIO_CLI_PARENT_RUN_ID: helperContext.runId } : {}),',
  '    ...(sharedRunOutputDir ? { COMPOSIO_RUN_OUTPUT_DIR: sharedRunOutputDir } : {}),',
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
  '  const result = maybeLoadStoredCliResult(parseJson(stdout));',
  '  const exitCode = await child.exited;',
  '  if (exitCode !== 0) {',
  '    perfDebugLog("error", requestId, { exitCode, stderr: stderr.trim() || undefined });',
  '    helperDebugLog("cli.error", { requestId, command: args[0], exitCode, stderr: stderr.trim() || undefined });',
  '    const error = new Error(`composio ${args.join(" ")} failed with exit code ${exitCode}`);',
  '    Object.assign(error, { exitCode, result, stderr: stderr.trim() || undefined });',
  '    throw error;',
  '  }',
  '  if (result === undefined) {',
  '    const details = stderr.trim();',
  '    const suffix = details ? `: ${details}` : "";',
  '    perfDebugLog("error", requestId, { exitCode, stderr: details || undefined, noJson: true });',
  '    helperDebugLog("cli.error", { requestId, command: args[0], exitCode, stderr: details || undefined, noJson: true });',
  '    const error = new Error(`composio ${args.join(" ")} returned no JSON output${suffix}`);',
  '    Object.assign(error, { exitCode, result, stderr: details || undefined });',
  '    throw error;',
  '  }',
  '  perfDebugLog("end", requestId, { exitCode, stdoutBytes: stdout.length, stderrBytes: stderr.length });',
  '  logCliResultPreview(requestId, args[0], result);',
  '  helperDebugLog("cli.done", { requestId, exitCode });',
  '  return result;',
  '};',
  '',
  'globalThis.search = async (query, options = {}) => {',
  '  helperDebugLog("search.prepare", { query, options });',
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
  '  helperDebugLog("execute.prepare", { slug, hasData: data !== undefined });',
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
  '  if (helperContext.skipChecks === true) {',
  '    args.push("--skip-checks");',
  '  }',
  '  if (data !== undefined) {',
  '    const serialized = typeof data === "string" ? data : JSON.stringify(data);',
  '    args.push("--data", serialized);',
  '  }',
  '  const result = await runCliJson(args);',
  '  if (result && typeof result === "object" && result.successful === false) {',
  '    const message = typeof result.error === "string" && result.error.trim().length > 0',
  '      ? result.error.trim()',
  '      : `composio execute ${slug} failed`;',
  '    const error = new Error(message);',
  '    Object.assign(error, { result, slug });',
  '    throw error;',
  '  }',
  '  return result;',
  '};',
  '',
];

const buildRunInvokeAgentHelpersSource = (): ReadonlyArray<string> => [
  'const subAgentImpl = async (prompt, options = {}) => {',
  '  if (typeof prompt !== "string" || prompt.trim().length === 0) {',
  '    throw new Error("subAgent() requires a non-empty prompt string.");',
  '  }',
  '  const normalizedOptions = normalizeInvokeAgentOptions(options);',
  '  const target = resolveInvokeAgentTarget(normalizedOptions.target);',
  '  const master = detectInvokeAgentMaster();',
  '  helperDebugLog("subAgent.target", { requestedTarget: normalizedOptions.target ?? null, resolvedTarget: target, master });',
  '  try {',
  '    return await invokeAcpSubAgent({',
  '      prompt: prompt.trim(),',
  '      options: normalizedOptions,',
  '      master,',
  '      target,',
  '      helperDebugLog,',
  '    });',
  '  } catch (error) {',
  '    if (!isAcpInvokeError(error)) {',
  '      throw error;',
  '    }',
  '    if (helperContext.acpOnly === true) {',
  '      throw error;',
  '    }',
  '    helperDebugLog("subAgent.acp.fallback", { target, code: error.code, message: error.message });',
  '    return invokeLegacySubAgent({',
  '      prompt: prompt.trim(),',
  '      options: normalizedOptions,',
  '      master,',
  '      target,',
  '      helperDebugLog,',
  '    });',
  '  }',
  '};',
  'globalThis.subAgent = subAgentImpl;',
  'Object.defineProperty(globalThis.subAgent, "schema", { value: subAgentSchema });',
  'globalThis.invokeAgent = subAgentImpl;',
  'Object.defineProperty(globalThis.invokeAgent, "schema", { value: subAgentSchema });',
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
  '  helperDebugLog("proxy.session", { toolkit: normalizedToolkit, cached: proxySessionCache.has(normalizedToolkit) });',
  '  const sessionId = await getProxySessionId(normalizedToolkit);',
  '  const proxyFetch = async (input, init = {}) => {',
  '    const request = await normalizeFetchInput(input, init);',
  '    helperDebugLog("proxy.request", { toolkit: normalizedToolkit, method: request.method, endpoint: request.endpoint });',
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
  context: RunHelperContext = {},
  moduleUrls: RunHelperModuleUrls = resolveRunHelperModuleUrls()
): string =>
  [
    'import { z } from "zod";',
    `import { isAcpInvokeError } from ${JSON.stringify(moduleUrls.subAgentSharedModuleUrl)};`,
    `import { invokeAcpSubAgent } from ${JSON.stringify(moduleUrls.subAgentAcpModuleUrl)};`,
    `import { invokeLegacySubAgent } from ${JSON.stringify(moduleUrls.subAgentLegacyModuleUrl)};`,
    '',
    `const cliPrefix = ${JSON.stringify(cliPrefix)};`,
    `const helperContext = ${JSON.stringify(context)};`,
    '',
    ...buildRunBaseHelpersSource(),
    ...buildRunInvokeAgentHelpersSource(),
    ...buildRunProxyHelpersSource(),
  ].join('\n');

const createRunHelpersPreloadFile = (
  cliPrefix: ReadonlyArray<string>,
  context: RunHelperContext,
  moduleUrls: RunHelperModuleUrls
) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-'));
  const preloadPath = path.join(directory, 'globals.mjs');
  const runOutputDir =
    typeof context.runOutputDir === 'string' && context.runOutputDir.length > 0
      ? context.runOutputDir
      : path.join(directory, 'artifacts');
  fs.mkdirSync(runOutputDir, { recursive: true });
  fs.writeFileSync(
    preloadPath,
    buildRunHelpersSource(cliPrefix, { ...context, runOutputDir }, moduleUrls),
    'utf8'
  );
  return { directory, preloadPath, runOutputDir };
};

export const buildRunCommand = ({
  file,
  args,
  preloadPath,
  preloadDirectory,
}: {
  file: Option.Option<string>;
  args: ReadonlyArray<string>;
  preloadPath: string;
  preloadDirectory: string;
}) => {
  // Use process.execPath directly — the child is spawned with BUN_BE_BUN=1
  // which makes compiled Bun binaries act as a plain Bun runtime.
  // Avoid the `run` subcommand entirely since Bun intercepts it as its own
  // built-in; `bun --preload <file> <script>` works without it.
  const base = [process.execPath, '--preload', preloadPath];
  if (Option.isSome(file)) {
    const filePath = path.resolve(file.value);
    const wrapperFilePath = path.join(
      path.dirname(filePath),
      `.composio-run-${path.basename(preloadDirectory)}${path.extname(filePath) || '.ts'}`
    );
    fs.writeFileSync(
      wrapperFilePath,
      wrapFileSourceForRun(fs.readFileSync(filePath, 'utf8')),
      'utf8'
    );
    return {
      cmd: [...base, wrapperFilePath, ...withArgDelimiter(args)],
      cleanupPaths: [wrapperFilePath],
    };
  }

  const [inlineCode, ...scriptArgs] = args;
  if (inlineCode) {
    const wrappedInlineCode = [
      '(async () => {',
      wrapInlineCodeForRun(inlineCode),
      '})().then((__composioResult) => {',
      '  if (__composioResult !== undefined) {',
      '    console.log(__composioResult);',
      '  }',
      '});',
    ].join('\n');
    return {
      cmd: [...base, '--eval', wrappedInlineCode, ...withArgDelimiter(scriptArgs)],
      cleanupPaths: [],
    };
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
      runOutputDir: Option.getOrUndefined(
        yield* resolveCliSessionArtifacts({
          orgId,
          consumerUserId: consumerProject.value.consumerUserId,
        }).pipe(Effect.map(Option.map(artifacts => artifacts.directoryPath)))
      ),
    } satisfies RunHelperContext;
  });

export const runCmd = Command.make('run', {
  file,
  dryRun,
  debug,
  logsOff,
  skipConnectionCheck,
  skipToolParamsCheck,
  skipChecks,
  args,
}).pipe(
  Command.withDescription(
    [
      'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.',
      '',
      'Examples:',
      `  composio run 'const issue = await execute("GITHUB_CREATE_ISSUE", { owner: "composiohq", repo: "composio", title: "Bug report" }); console.log(issue)'`,
      `  composio run --dry-run 'await execute("GMAIL_SEND_EMAIL", { recipient_email: "a@b.com", body: "Hello" })'`,
      `  composio run --debug 'const me = await execute("GITHUB_GET_THE_AUTHENTICATED_USER"); console.log(me)'`,
      `  composio run '`,
      `    const [emails, issues] = await Promise.all([`,
      `      execute("GMAIL_FETCH_EMAILS", { max_results: 5 }),`,
      `      execute("GITHUB_LIST_REPOSITORY_ISSUES", { owner: "composiohq", repo: "composio", state: "open" }),`,
      `    ]);`,
      `    const brief = await subAgent(`,
      `      \`Create a morning brief from these emails and issues.\\n\\n\${emails.prompt()}\\n\\n\${issues.prompt()}\`,`,
      `      {`,
      `        schema: z.object({`,
      `          brief: z.string(),`,
      `          urgentEmails: z.array(z.string()),`,
      `          urgentIssues: z.array(z.string()),`,
      `        }),`,
      `      }`,
      `    );`,
      `    brief.structuredOutput;`,
      `  '`,
      '  composio run --file ./script.ts -- hello world',
      '',
      'Injected helpers (behave like their CLI counterparts):',
      '  execute(slug, data?)          Same as `composio execute` — returns parsed JSON',
      '  search(query, options?)        Same as `composio search` — returns matching tools',
      '  subAgent(prompt, options?)     Spawn a powerful sub-agent from the same agent family as your current main agent',
      '                                 (Codex -> Codex, Claude -> Claude) with optional Zod structured output',
      '  result.prompt()                Prompt-safe serialization of a helper result, ideal for subAgent(...)',
      '  const f = await proxy(toolkit) Same as `composio proxy` — returns a fetch function',
      '                                 Example: const f = await proxy("gmail")',
      '                                          const me = await f("https://gmail.googleapis.com/gmail/v1/users/me/profile")',
      '  z                              Injected global from `zod` for structured output schemas',
      '',
      'All helpers reuse your CLI auth state and connected accounts.',
      '',
      'Flags:',
      '  --debug                     Log helper steps while the script runs',
      '  --dry-run                   Preview execute() calls without running them',
      '  --logs-off                  Hide the always-on subAgent streaming logs',
      '  --skip-connection-check     Skip the connected-account check',
      '  --skip-tool-params-check    Skip input validation against cached schema',
      '  --skip-checks               Skip both checks above',
      '',
      'See also:',
      '  composio search "<query>"                 Discover tool slugs before scripting',
      '  composio link <toolkit>                   Connect accounts before scripting',
      '  composio execute <slug> --get-schema      Inspect tool inputs before scripting',
    ].join('\n')
  ),
  Command.withHandler(
    ({
      file,
      dryRun,
      debug,
      logsOff,
      skipConnectionCheck,
      skipToolParamsCheck,
      skipChecks,
      args,
    }) =>
      Effect.gen(function* () {
        const runId = process.env.COMPOSIO_CLI_PARENT_RUN_ID ?? crypto.randomUUID();
        const perfDebug = isPerfDebugEnabled();
        const toolDebug = isToolDebugEnabled();
        const acpOnly = process.env.COMPOSIO_RUN_ACP_ONLY === '1';
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

        const helperContext: RunHelperContext = {
          ...(yield* resolveRunHelperContext()),
          runId,
          master: detectMaster(),
          perfDebug,
          toolDebug,
          debug,
          logsOff,
          acpOnly,
          dryRun,
          skipConnectionCheck,
          skipToolParamsCheck,
          skipChecks,
        };
        const runHelperModuleUrls = yield* Effect.tryPromise({
          try: async () => {
            await repairMissingInstalledRunCompanionModules({
              callerImportMetaUrl: import.meta.url,
              execPath: process.execPath,
              appVersion: APP_VERSION,
            });

            return resolveRunHelperModuleUrls();
          },
          catch: error =>
            new Error(
              error instanceof Error
                ? error.message
                : `Failed to prepare the modules required by 'composio run': ${String(error)}`
            ),
        });
        const preload = createRunHelpersPreloadFile(
          inferCliInvocationPrefix(),
          helperContext,
          runHelperModuleUrls
        );
        let cleanupPaths: ReadonlyArray<string> = [];
        try {
          yield* appendCliSessionHistory({
            orgId: helperContext.orgId,
            consumerUserId: helperContext.consumerUserId,
            entry: {
              command: 'run',
              status: 'start',
              file: Option.getOrUndefined(file),
              args,
              debug,
            },
          }).pipe(Effect.catchAll(() => Effect.void));
          const runCommand = buildRunCommand({
            file,
            args,
            preloadPath: preload.preloadPath,
            preloadDirectory: preload.directory,
          });
          cleanupPaths = runCommand.cleanupPaths;
          const child = Bun.spawn({
            cmd: runCommand.cmd,
            env: {
              ...process.env,
              BUN_BE_BUN: '1',
              COMPOSIO_CLI_PARENT_RUN_ID: runId,
              ...(perfDebug ? { COMPOSIO_PERF_DEBUG: '1' } : {}),
              ...(toolDebug ? { COMPOSIO_TOOL_DEBUG: '1' } : {}),
            },
            stdio: ['inherit', 'inherit', 'inherit'],
          });

          const exitCode = yield* Effect.promise(() => child.exited);
          process.exit(exitCode);
        } finally {
          for (const cleanupPath of cleanupPaths) {
            fs.rmSync(cleanupPath, { force: true });
          }
          fs.rmSync(preload.directory, { recursive: true, force: true });
        }
      })
  )
);
