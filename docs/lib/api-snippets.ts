/**
 * Validates Composio curl request shapes against published OpenAPI constraints,
 * with operation-scoped, stale-checked exceptions. A parameter-route match
 * alone does not establish that a literal runtime endpoint exists.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { z } from 'zod';
import { parseCodeExamples, walkCodeExamples, type CodeExampleFile, type MarkerUnit } from './code-examples';

export type ApiSnippetRule =
  | 'api-legacy-version'
  | 'api-base-url'
  | 'api-unknown-operation'
  | 'api-key-header'
  | 'api-json-invalid'
  | 'api-body-schema'
  | 'api-body-unchecked'
  | 'api-curl-unsupported'
  | 'api-exemption';

export type ApiSnippetViolation = { path: string; line: number; rule: ApiSnippetRule; message: string };

// ---------------------------------------------------------------------------
// Shell lexing
// ---------------------------------------------------------------------------

/** A run of a shell word: literal text (quotes removed) or an unexpanded `$VAR`/`${..}`/`$(..)`/backtick expansion. */
export type ShellSegment = { text: string; expansion: boolean };
/** A shell word as its segments, with the 1-based line it starts on. */
export type ShellWord = { segments: ShellSegment[]; line: number };

type Token = { kind: 'word'; word: ShellWord } | { kind: 'op'; op: string };

type Expansion = { text: string; end: number; substitution?: string };

const OPERATORS = ['&&', '||', ';;', '|&', '|', '&', ';', '(', ')'];
const REDIRECT_RE = /^(?:[<>]{1,2}&?\d*-?|&>>?)/;

export const wordText = (word: ShellWord) => word.segments.map((segment) => segment.text).join('');

/** Index just past the `)` closing a `$(` whose body starts at `from`; skips quotes and nested parens. */
function closeParen(src: string, from: number): number {
  let depth = 1;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') i++;
    else if (c === "'") i = src.indexOf("'", i + 1) < 0 ? src.length : src.indexOf("'", i + 1);
    else if (c === '`' || (c === '$' && (src[i + 1] === '(' || src[i + 1] === '{'))) {
      const expansion = readExpansion(src, i);
      if (expansion) i = expansion.end - 1;
    } else if (c === '#' && (i === from || /[\s;|&()]/.test(src[i - 1]))) {
      while (i < src.length && src[i] !== '\n') i++;
    }
    else if (c === '"') {
      for (i++; i < src.length && src[i] !== '"'; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '$' && src[i + 1] === '(') i = closeParen(src, i + 2) - 1;
      }
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return src.length + 1;
}

/** Reads a `$`/backtick expansion at `i`, or returns undefined when `$` is literal. */
function readExpansion(src: string, i: number): Expansion | undefined {
  if (src[i] === '`') {
    let end = i + 1;
    while (end < src.length && src[end] !== '`') end += src[end] === '\\' ? 2 : 1;
    return { text: src.slice(i, end + 1), end: end + 1, substitution: src.slice(i + 1, end) };
  }
  if (src.startsWith('$((', i)) {
    const end = closeParen(src, i + 2);
    return { text: src.slice(i, end), end };
  }
  if (src.startsWith('$(', i)) {
    const end = closeParen(src, i + 2);
    return { text: src.slice(i, end), end, substitution: src.slice(i + 2, end - 1) };
  }
  if (src.startsWith('${', i)) {
    let depth = 0;
    let end = i + 1;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}' && --depth === 0) break;
    }
    return { text: src.slice(i, end + 1), end: end + 1 };
  }
  const name = /^\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(src.slice(i, i + 256));
  return name ? { text: name[0], end: i + name[0].length } : undefined;
}

/**
 * Tokenizes shell source into words and control operators. Handles quoting,
 * `\` line continuations, comments, and redirections; command substitutions are
 * collected (with their starting line) so callers can lex them recursively.
 */
function lexShell(src: string, firstLine: number) {
  const tokens: Token[] = [];
  const substitutions: { code: string; line: number }[] = [];
  const issues: string[] = [];
  let line = firstLine;
  let word: ShellSegment[] | undefined;
  let wordLine = firstLine;

  const startWord = () => {
    if (!word) {
      word = [];
      wordLine = line;
    }
    return word;
  };
  const push = (text: string, expansion: boolean) => {
    const segments = startWord();
    const last = segments.at(-1);
    if (last && !last.expansion && !expansion) last.text += text;
    else segments.push({ text, expansion });
  };
  const endWord = () => {
    if (word) tokens.push({ kind: 'word', word: { segments: word, line: wordLine } });
    word = undefined;
  };
  const countLines = (text: string) => {
    for (const c of text) if (c === '\n') line++;
  };
  /** Consumes an expansion at `i`; returns the index after it, or undefined when `$` is literal. */
  const expand = (i: number): number | undefined => {
    const expansion = readExpansion(src, i);
    if (!expansion) return undefined;
    if (expansion.end > src.length || (src.startsWith('$(', i) && !expansion.text.endsWith(')')) ||
        (src.startsWith('${', i) && !expansion.text.endsWith('}')) ||
        (src[i] === '`' && !expansion.text.endsWith('`'))) issues.push('unterminated shell expansion');
    if (expansion.substitution !== undefined) substitutions.push({ code: expansion.substitution, line });
    push(expansion.text, true);
    countLines(expansion.text);
    return expansion.end;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] === '\r' && src[i + 2] === '\n') {
        line++;
        i += 3;
        continue;
      }
      if (src[i + 1] === '\n') line++;
      else if (i + 1 < src.length) push(src[i + 1], false);
      else issues.push('dangling shell escape');
      i += 2;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i++;
    } else if (c === '\n') {
      endWord();
      tokens.push({ kind: 'op', op: '\n' });
      line++;
      i++;
    } else if (c === '#' && !word) {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === "'") {
      const close = src.indexOf("'", i + 1);
      if (close < 0) issues.push('unterminated single quote');
      const end = close < 0 ? src.length : close;
      push(src.slice(i + 1, end), false);
      countLines(src.slice(i + 1, end));
      i = end + 1;
    } else if (c === '"') {
      startWord();
      for (i++; i < src.length && src[i] !== '"'; ) {
        const d = src[i];
        if (d === '\\' && src[i + 1] === '\r' && src[i + 2] === '\n') {
          line++;
          i += 3;
        } else if (d === '\\' && src[i + 1] === '\n') {
          line++;
          i += 2;
        } else if (d === '\\' && '$`"\\'.includes(src[i + 1] ?? '')) {
          push(src[i + 1], false);
          i += 2;
        } else if (d === '$' || d === '`') {
          const end = expand(i);
          if (end === undefined) push(d, false);
          i = end ?? i + 1;
        } else {
          if (d === '\n') line++;
          push(d, false);
          i++;
        }
      }
      if (i >= src.length) issues.push('unterminated double quote');
      i++;
    } else if (c === '$' || c === '`') {
      const end = expand(i);
      if (end === undefined) push(c, false);
      i = end ?? i + 1;
    } else if ((c === '<' || c === '>' || c === '&') && REDIRECT_RE.test(src.slice(i, i + 8))) {
      const redirect = REDIRECT_RE.exec(src.slice(i, i + 8))?.[0] ?? c;
      // A word of digits right before the operator is its file descriptor (`2>`), not an argument.
      if (word?.length === 1 && !word[0].expansion && /^\d+$/.test(word[0].text)) word = undefined;
      endWord();
      tokens.push({ kind: 'op', op: /&\d|&-$/.test(redirect) ? 'dup' : 'redirect' });
      i += redirect.length;
    } else {
      const op = OPERATORS.find((candidate) => src.startsWith(candidate, i));
      if (op) {
        endWord();
        tokens.push({ kind: 'op', op });
        i += op.length;
      } else {
        push(c, false);
        i++;
      }
    }
  }
  endWord();
  return { tokens, substitutions, issues };
}

/** Splits tokens into simple commands (word lists), dropping redirection targets. */
function simpleCommands(tokens: Token[]): ShellWord[][] {
  const commands: ShellWord[][] = [];
  let current: ShellWord[] = [];
  let skipNext = false;
  for (const token of tokens) {
    if (token.kind === 'word') {
      if (skipNext) skipNext = false;
      else current.push(token.word);
    } else if (token.op === 'redirect') {
      skipNext = true;
    } else if (token.op !== 'dup') {
      if (current.length) commands.push(current);
      current = [];
    }
  }
  if (current.length) commands.push(current);
  return commands;
}

// ---------------------------------------------------------------------------
// curl parsing
// ---------------------------------------------------------------------------

export type CurlCommand = {
  /** Line of the `curl` word. */
  line: number;
  /** Upper-case HTTP method, explicit (`-X`) or inferred from `-G`/`-I`/data options. */
  method: string;
  /** Positional and `--url` arguments, in order. */
  urls: ShellWord[];
  headers: { name: string; value: ShellWord }[];
  /** `-d`/`--data*`/`--json`/`-F` arguments with the option that carried them. */
  data: { option: string; value: ShellWord }[];
  /** True for `-G`/`--get`: data is sent as the query string. */
  get: boolean;
  upload: boolean;
  issues: string[];
};

const SHORT_VALUE_OPTIONS = 'AbcCdDeEFHKmoPQrtTuUwxXyYz';
const SHORT_FLAGS = 'fsSLsSivNkgORJnj#012346V';
const LONG_FLAGS: Record<string, true> = Object.fromEntries([
  '--get', '--head', '--location', '--location-trusted', '--fail', '--fail-with-body',
  '--silent', '--show-error', '--compressed', '--verbose', '--include', '--insecure',
  '--globoff', '--no-buffer', '--no-progress-meter', '--progress-bar', '--http1.0',
  '--http1.1', '--http2', '--http2-prior-knowledge', '--http3', '--ipv4', '--ipv6',
  '--retry-all-errors', '--retry-connrefused', '--no-keepalive', '--tcp-nodelay',
  '--create-dirs', '--remove-on-error', '--remote-name', '--remote-header-name',
].map((option) => [option, true] as const));
const LONG_VALUE_OPTIONS: Record<string, boolean> = Object.fromEntries(
  [
    '--request', '--header', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode', '--json',
    '--url', '--output', '--user', '--form', '--form-string', '--max-time', '--connect-timeout', '--retry',
    '--retry-delay', '--retry-max-time', '--write-out', '--user-agent', '--referer', '--cookie', '--cookie-jar',
    '--upload-file', '--proxy', '--proxy-user', '--config', '--range', '--cert', '--cacert', '--key', '--limit-rate',
    '--max-redirs', '--resolve', '--dump-header', '--oauth2-bearer', '--variable', '--url-query', '--output-dir',
    '--connect-to', '--interface', '--continue-at', '--speed-limit', '--speed-time', '--trace', '--trace-ascii',
    '--stderr', '--expect100-timeout', '--happy-eyeballs-timeout-ms', '--keepalive-time',
  ].map((option) => [option, true] as const),
);
const SHORT_LONG: Record<string, string> = {
  X: '--request', H: '--header', d: '--data', F: '--form', G: '--get', I: '--head',
  T: '--upload-file', K: '--config',
};
const DATA_OPTIONS: Record<string, true> = {
  '--data': true,
  '--data-raw': true,
  '--data-binary': true,
  '--data-ascii': true,
  '--data-urlencode': true,
  '--json': true,
  '--form': true,
  '--form-string': true,
};

/** Drops the first `count` characters of a word (used for attached short-option values like `-XPOST`). */
function dropChars(word: ShellWord, count: number): ShellWord {
  const segments = [...word.segments];
  let remaining = count;
  while (remaining > 0 && segments.length) {
    const first = segments[0];
    if (first.text.length > remaining) {
      segments[0] = { text: first.text.slice(remaining), expansion: first.expansion };
      remaining = 0;
    } else {
      remaining -= first.text.length;
      segments.shift();
    }
  }
  return { segments, line: word.line };
}

function trimWord(word: ShellWord): ShellWord {
  const segments = word.segments
    .map((segment, index, all) => {
      if (segment.expansion) return segment;
      let text = segment.text;
      if (index === 0) text = text.trimStart();
      if (index === all.length - 1) text = text.trimEnd();
      return { text, expansion: false };
    })
    .filter((segment) => segment.expansion || segment.text);
  return { segments, line: word.line };
}

function splitHeader(word: ShellWord): { name: string; value: ShellWord } | undefined {
  const first = word.segments[0];
  const colon = first && !first.expansion ? first.text.indexOf(':') : -1;
  if (colon < 0) return undefined;
  return { name: first.text.slice(0, colon).trim().toLowerCase(), value: trimWord(dropChars(word, colon + 1)) };
}

function parseCurl(words: ShellWord[]): CurlCommand[] {
  const commands: CurlCommand[] = [];
  const fresh = (): CurlCommand => ({
    line: words[0].line, method: '', urls: [], headers: [], data: [], get: false, upload: false, issues: [],
  });
  let command = fresh();
  let head = false;
  let positional = false;
  const finish = () => {
    if (!command.method) command.method = head ? 'HEAD' : command.get ? 'GET' : command.upload ? 'PUT' : command.data.length ? 'POST' : 'GET';
    commands.push(command);
    command = fresh();
    head = false;
    positional = false;
  };
  const apply = (option: string, value?: ShellWord) => {
    if (option === '--get') command.get = true;
    else if (option === '--head') head = true;
    if (LONG_VALUE_OPTIONS[option] && !value) {
      command.issues.push(`${option} requires a value`);
      return;
    }
    if (!value) return;
    if (option === '--request') {
      command.method = wordText(value).toUpperCase();
      if (value.segments.some((part) => part.expansion)) command.issues.push('expanded HTTP method cannot be checked');
      if (!/^[!#$%&'*+.^_`|~0-9A-Z-]+$/.test(command.method)) command.issues.push('HTTP method must be a nonempty literal token');
    } else if (option === '--url') command.urls.push(value);
    else if (option === '--header') {
      const header = splitHeader(value);
      if (header) command.headers.push(header);
      else command.issues.push('file-backed, expanded, or malformed header cannot be checked');
    } else if (option === '--oauth2-bearer') {
      command.headers.push({ name: 'authorization', value: { line: value.line, segments: [{ text: 'Bearer ', expansion: false }, ...value.segments] } });
    } else if (option === '--upload-file') {
      command.upload = true;
      command.data.push({ option, value });
    } else if (DATA_OPTIONS[option]) command.data.push({ option, value });
    else if (option === '--config' || option === '--variable') command.issues.push(`${option} may hide request settings and cannot be checked`);
  };
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const text = wordText(word);
    const first = word.segments[0];
    if (positional) command.urls.push(word);
    else if (text === '--') positional = true;
    else if (text === '--next' || text === '-:') finish();
    else if (!first || first.expansion || !first.text.startsWith('-') || text === '-') {
      command.urls.push(word);
      if (first?.expansion && !BASE_URL_VARS[first.text]) command.issues.push('expanded curl argument may hide request settings');
    } else if (text.startsWith('--')) {
      const equals = text.indexOf('=');
      const option = equals < 0 ? text : text.slice(0, equals);
      if (!LONG_VALUE_OPTIONS[option] && !LONG_FLAGS[option]) {
        command.issues.push(`unsupported curl option ${option}`);
        continue;
      }
      if (equals >= 0 && !LONG_VALUE_OPTIONS[option]) command.issues.push(`${option} does not accept a value`);
      apply(option, LONG_VALUE_OPTIONS[option] ? equals < 0 ? words[++i] : dropChars(word, equals + 1) : undefined);
    } else {
      for (let j = 1; j < first.text.length; j++) {
        const flag = first.text[j];
        const option = SHORT_LONG[flag] ?? `-${flag}`;
        if (SHORT_VALUE_OPTIONS.includes(flag)) {
          const value = j + 1 < text.length ? dropChars(word, j + 1) : words[++i];
          if (!value) command.issues.push(`${option} requires a value`);
          apply(option, value);
          break;
        }
        if (!SHORT_LONG[flag] && !SHORT_FLAGS.includes(flag)) command.issues.push(`unsupported curl option -${flag}`);
        apply(option);
      }
    }
  }
  finish();
  return commands;
}

/**
 * Parses every `curl` invocation in shell source, including those inside
 * `$(...)`/backtick substitutions and pipelines. `firstLine` is the file line
 * of the code's first line. Results are ordered by line.
 */
export function parseCurlCommands(code: string, firstLine = 1): CurlCommand[] {
  const commands: CurlCommand[] = [];
  const visit = (src: string, line: number) => {
    const { tokens, substitutions, issues } = lexShell(src, line);
    for (const words of simpleCommands(tokens)) {
      let start = 0;
      while (start < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start].segments[0]?.text ?? '')) start++;
      const name = words[start];
      if (name && wordText(name) === 'curl' && !name.segments.some((segment) => segment.expansion)) {
        for (const command of parseCurl(words.slice(start))) {
          command.issues.push(...issues);
          commands.push(command);
        }
      }
    }
    for (const substitution of substitutions) visit(substitution.code, substitution.line);
  };
  visit(code, firstLine);
  return commands.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------
// OpenAPI specs
// ---------------------------------------------------------------------------

export type ApiOperation = {
  /** An empty requirement is public; an unknown security scheme is not. */
  auth: { headers: string[]; unsupported: string[] }[];
  hasBody: boolean;
  bodyRequired: boolean;
  bodySchema: unknown;
  document: Record<string, unknown>;
  ajv: Ajv;
  validator?: ValidateFunction;
};

export type ApiSpec = {
  name: string;
  paths: { template: string; parts: string[]; methods: Map<string, ApiOperation> }[];
};

export type ApiSpecs = { v3_1: ApiSpec; v3: ApiSpec };

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const securityRequirements = z.array(z.record(z.string(), z.array(z.string())));

const jsonObject = z.record(z.string(), z.unknown());
const reference = z.object({ $ref: z.string() });
const securityScheme = z.object({ type: z.string(), in: z.string().optional(), name: z.string().optional(), scheme: z.string().optional() });
const openApiDocument = z.object({
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  security: securityRequirements.optional(),
  components: z.object({
    securitySchemes: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});
const requestBody = z.object({
  required: z.boolean().optional(),
  content: z.record(z.string(), z.object({ schema: z.unknown().optional() })).optional(),
});
const openApiOperation = z.object({
  security: securityRequirements.optional(),
  requestBody: z.unknown().optional(),
});

/**
 * OpenAPI 3.0 uses draft-04-style boolean exclusive bounds. Ajv's default
 * dialect uses numeric exclusive bounds. Translate only Schema Objects, not
 * examples/defaults/enum values or properties that happen to have those names.
 */
function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  const object = jsonObject.safeParse(value);
  if (!object.success) return value;
  const schema = { ...object.data };
  for (const [inclusive, exclusive] of [['minimum', 'exclusiveMinimum'], ['maximum', 'exclusiveMaximum']] as const) {
    const flag = z.boolean().safeParse(schema[exclusive]);
    if (!flag.success) continue;
    if (flag.data) {
      const bound = z.number().safeParse(schema[inclusive]);
      if (!bound.success) throw new Error(`OpenAPI ${exclusive}: true requires a numeric ${inclusive}`);
      schema[exclusive] = bound.data;
      delete schema[inclusive];
    } else delete schema[exclusive];
  }
  for (const key of ['properties', 'patternProperties', 'definitions', '$defs', 'dependentSchemas']) {
    if (schema[key] === undefined) continue;
    schema[key] = Object.fromEntries(Object.entries(jsonObject.parse(schema[key])).map(([name, child]) => [name, normalizeSchema(child)]));
  }
  for (const key of ['items', 'additionalItems', 'additionalProperties', 'allOf', 'anyOf', 'oneOf', 'not', 'contains', 'if', 'then', 'else', 'propertyNames', 'prefixItems', 'unevaluatedProperties', 'unevaluatedItems']) {
    if (schema[key] !== undefined) schema[key] = normalizeSchema(schema[key]);
  }
  return schema;
}

/** Keep document-relative references intact while normalizing each schema once. */
function normalizeOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeOpenApi);
  const object = jsonObject.safeParse(value);
  if (!object.success) return value;
  return Object.fromEntries(Object.entries(object.data).map(([key, child]) => {
    if (key === 'schema') return [key, normalizeSchema(child)];
    if (key === 'schemas') return [key, Object.fromEntries(Object.entries(jsonObject.parse(child)).map(([name, schema]) => [name, normalizeSchema(schema)]))];
    if (key === 'example' || key === 'examples' || key === 'default' || key === 'enum' || key === 'const') return [key, child];
    return [key, normalizeOpenApi(child)];
  }));
}

function resolveReference(value: unknown, document: Record<string, unknown>): unknown {
  const seen = new Set<string>();
  for (;;) {
    const parsed = reference.safeParse(value);
    if (!parsed.success) return value;
    const ref = parsed.data.$ref;
    if (!ref.startsWith('#/') || seen.has(ref)) throw new Error(`Unresolvable OpenAPI reference ${ref}`);
    seen.add(ref);
    value = document;
    for (const part of ref.slice(2).split('/')) {
      value = jsonObject.parse(value)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
  }
}

/** Keeps schema references intact so Ajv, not an approximate schema walker, evaluates them. */
export function parseApiSpec(name: string, json: unknown): ApiSpec {
  const raw = jsonObject.parse(normalizeOpenApi(json));
  const document = openApiDocument.parse(raw);
  const schemes = document.components?.securitySchemes ?? {};
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false, allowUnionTypes: true });
  const paths = Object.entries(document.paths).map(([template, item]) => {
    const methods = new Map<string, ApiOperation>();
    for (const method of HTTP_METHODS) {
      if (item[method] === undefined) continue;
      const operation = openApiOperation.parse(resolveReference(item[method], raw));
      const body = operation.requestBody === undefined ? undefined : requestBody.parse(resolveReference(operation.requestBody, raw));
      const security = operation.security ?? document.security ?? [];
      methods.set(method.toUpperCase(), {
        auth: security.map((requirement) => {
          const headers: string[] = [];
          const unsupported: string[] = [];
          for (const scheme of Object.keys(requirement)) {
            const definition = schemes[scheme] === undefined ? undefined : securityScheme.parse(resolveReference(schemes[scheme], raw));
            if (definition?.type === 'apiKey' && definition.in === 'header' && definition.name) headers.push(definition.name.toLowerCase());
            else if (definition?.type === 'http' && definition.scheme === 'bearer') headers.push('authorization');
            else unsupported.push(scheme);
          }
          return { headers, unsupported };
        }),
        hasBody: body !== undefined,
        bodyRequired: body?.required === true,
        bodySchema: body?.content?.['application/json']?.schema,
        document: raw,
        ajv,
      });
    }
    const parts = template.split('/').filter((part, index, all) => index > 0 && (part || index < all.length - 1));
    return { template, parts, methods };
  });
  return { name, paths };
}

/** Loads `public/openapi.json` (v3.1) and `public/openapi-v3.json` (v3) from the docs root. */
export function loadApiSpecs(docsRoot: string): ApiSpecs {
  const load = (file: string) => parseApiSpec(file, JSON.parse(readFileSync(join(docsRoot, 'public', file), 'utf8')));
  return { v3_1: load('openapi.json'), v3: load('openapi-v3.json') };
}

// ---------------------------------------------------------------------------
// Request body validation
// ---------------------------------------------------------------------------

/** Stands in for shell expansions in JSON bodies; a string equal to it matches any schema. */
const SHELL = '\u0000';
const SHELL_VALUE = `${SHELL}shell-value`;

const projectionNode = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
  additionalProperties: z.unknown().optional(),
  items: z.unknown().optional(),
  oneOf: z.array(z.unknown()).optional(),
  anyOf: z.array(z.unknown()).optional(),
  allOf: z.array(z.unknown()).optional(),
}).passthrough();

function hasUnknown(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(SHELL);
  if (Array.isArray(value)) return value.some(hasUnknown);
  const object = jsonObject.safeParse(value);
  return object.success && Object.values(object.data).some(hasUnknown);
}

function compileBody(operation: ApiOperation, schema: unknown): ValidateFunction {
  // Preserve original document-relative and recursive JSON Pointers.
  return operation.ajv.compile({ ...operation.document, schema, $ref: '#/schema' });
}

/**
 * Project only unknown instance positions out of a schema. Literal requests use
 * the original schema verbatim. Ajv still evaluates every remaining constraint.
 * A partially known oneOf cannot establish branch exclusivity when a passing
 * branch depends on an unknown value.
 */
function projectSchema(schema: unknown, value: unknown, operation: ApiOperation): { schema: unknown; uncertain: boolean } {
  if (!hasUnknown(value)) return { schema, uncertain: false };
  schema = resolveReference(schema, operation.document);
  if (typeof schema === 'boolean') return { schema, uncertain: false };
  const node = projectionNode.parse(schema);
  if (value === SHELL_VALUE) return { schema: true, uncertain: Object.keys(node).length > 0 };
  const projected: Record<string, unknown> = { ...node };
  let uncertain = false;
  for (const keyword of typeof value === 'string' ? ['enum', 'const', 'pattern', 'minLength', 'maxLength', 'format'] : ['enum', 'const']) {
    if (projected[keyword] !== undefined) {
      delete projected[keyword];
      uncertain = true;
    }
  }
  if (node.not !== undefined) {
    const result = projectSchema(node.not, value, operation);
    if (result.uncertain) {
      delete projected.not;
      uncertain = true;
    }
  }
  const object = jsonObject.safeParse(value);
  if (object.success) {
    const properties = { ...node.properties };
    for (const [key, item] of Object.entries(object.data)) {
      const itemSchema = properties[key] ?? node.additionalProperties;
      if (itemSchema === undefined || itemSchema === false) continue;
      const result = projectSchema(itemSchema, item, operation);
      if (result.uncertain) {
        properties[key] = result.schema;
        uncertain = true;
      }
    }
    if (node.properties || Object.keys(properties).length) projected.properties = properties;
  }
  if (Array.isArray(value) && node.items !== undefined) {
    projected.items = value.map((item, index) => {
      const itemSchema = Array.isArray(node.items) ? node.items[index] ?? true : node.items;
      const result = projectSchema(itemSchema, item, operation);
      uncertain ||= result.uncertain;
      return result.schema;
    });
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = node[keyword];
    if (!branches) continue;
    const results = branches.map((branch) => projectSchema(branch, value, operation));
    projected[keyword] = results.map((result) => result.schema);
    uncertain ||= results.some((result) => result.uncertain);
    if (keyword === 'oneOf') {
      const passing = results.filter((result) => compileBody(operation, result.schema)(value));
      if (passing.some((result) => result.uncertain)) {
        delete projected.oneOf;
        projected.allOf = [...(z.array(z.unknown()).optional().parse(projected.allOf) ?? []), { anyOf: results.map((result) => result.schema) }];
      }
    }
  }
  return { schema: projected, uncertain };
}

function bodyErrors(operation: ApiOperation, value: unknown): ErrorObject[] {
  const validate = hasUnknown(value)
    ? compileBody(operation, projectSchema(operation.bodySchema, value, operation).schema)
    : operation.validator ??= compileBody(operation, operation.bodySchema);
  validate(value);
  return validate.errors ?? [];
}

function errorField(error: ErrorObject): string {
  const segments = error.instancePath.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (error.keyword === 'required') segments.push(z.object({ missingProperty: z.string() }).parse(error.params).missingProperty);
  if (error.keyword === 'additionalProperties') segments.push(z.object({ additionalProperty: z.string() }).parse(error.params).additionalProperty);
  return segments.join('.');
}

/**
 * Renders a data argument as JSON text: shell expansions inside JSON strings
 * become placeholder characters, bare expansions become a placeholder string.
 */
function bodyJson(word: ShellWord): string {
  let json = '';
  let inString = false;
  let escaped = false;
  for (const segment of word.segments) {
    if (segment.expansion) {
      json += inString ? '\\u0000' : JSON.stringify(SHELL_VALUE);
      continue;
    }
    for (const c of segment.text) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = inString;
      else if (c === '"') inString = !inString;
    }
    json += segment.text;
  }
  return json;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const SHELL_LANGS: Record<string, true> = { bash: true, sh: true, shell: true, curl: true };
const API_HOST_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?backend\.composio\.dev(?::\d+)?(?=[/?#]|$)/i;
const BASE_URL_VARS: Record<string, true> = {
  $COMPOSIO_BASE_URL: true, '${COMPOSIO_BASE_URL}': true,
  $THERMOS_BASE_URL: true, '${THERMOS_BASE_URL}': true,
};
const CANONICAL_ORIGIN = 'https://backend.composio.dev';
const CANONICAL_BASE = `${CANONICAL_ORIGIN}/api/v3.1`;
const API_KEY_HEADER = 'x-api-key';
const API_KEY_VALUE_RE = /^\$(?:COMPOSIO_[A-Z0-9_]*API_KEY|\{COMPOSIO_[A-Z0-9_]*API_KEY\})$/;
const ENV_VAR_RE = /^\$(?:[A-Z][A-Z0-9_]*|\{[A-Z][A-Z0-9_]*\})$/;

type PathPart = { text: string; dynamic: boolean };
type ApiUrl = { origin: string; path: string; parts: PathPart[] };
type Report = (rule: ApiSnippetRule, message: string, field?: string) => void;

/** Splits an API URL into origin and path parts; undefined when the URL is not a Composio API URL. */
function apiUrl(word: ShellWord): ApiUrl | undefined {
  let origin: string;
  let rest: ShellSegment[];
  const [first, ...others] = word.segments;
  if (first?.expansion && BASE_URL_VARS[first.text]) {
    origin = first.text;
    rest = others;
  } else {
    const match = first && !first.expansion ? API_HOST_RE.exec(first.text) : null;
    if (!match) return undefined;
    origin = match[0];
    rest = [{ text: first.text.slice(match[0].length), expansion: false }, ...others];
  }

  // Path text with expansions marked, cut at the query string or fragment.
  let path = '';
  const dynamic: boolean[] = [];
  outer: for (const segment of rest) {
    for (const c of segment.text) {
      if (!segment.expansion && (c === '?' || c === '#')) break outer;
      path += c;
      dynamic.push(segment.expansion);
    }
  }
  const parts: PathPart[] = [];
  let offset = 0;
  for (const text of path.split('/')) {
    parts.push({
      text,
      dynamic: dynamic.slice(offset, offset + text.length).some(Boolean) || /^(?:<.+>|\{.+\})$/.test(text),
    });
    offset += text.length + 1;
  }
  return { origin, path, parts: parts.filter((part, index) => index > 0 && (part.text || index < parts.length - 1)) };
}

function findOperation(spec: ApiSpec, parts: PathPart[], method: string) {
  const matches = spec.paths.flatMap((entry) => {
    if (entry.parts.length !== parts.length) return [];
    let literal = 0;
    for (const [index, templatePart] of entry.parts.entries()) {
      const part = parts[index];
      if (/^\{[^}]+\}$/.test(templatePart)) {
        if (!part.text) return [];
      } else if (part.dynamic || part.text !== templatePart) return [];
      else literal++;
    }
    return [{ entry, literal }];
  });
  matches.sort((a, b) => b.literal - a.literal);
  const match = matches[0];
  if (match) return {
    template: match.entry.template,
    operation: match.entry.methods.get(method),
    allowed: [...match.entry.methods.keys()],
  };
  return { allowed: [] };
}

function checkAuth(curl: CurlCommand, operation: Pick<ApiOperation, 'auth'>, report: Report) {
  if (!operation.auth.length) return;
  const sent = new Map(curl.headers.map((header) => [header.name, header.value]));
  const results = operation.auth.map(({ headers, unsupported }) => {
    const errors: { message: string; field?: string }[] = unsupported.map((name) => ({ message: `cannot validate security scheme "${name}"; it is not public access` }));
    for (const name of headers) {
      let value = sent.get(name);
      if (!value) {
        errors.push({ message: `missing auth header: send ${name}`, field: name });
        continue;
      }
      if (name === 'authorization') {
        if (!wordText(value).startsWith('Bearer ')) {
          errors.push({ message: 'authorization header must use Bearer with an environment variable', field: name });
          continue;
        }
        value = trimWord(dropChars(value, 7));
      }
      const [segment, ...others] = value.segments;
      const single = segment?.expansion && others.length === 0 ? segment.text : undefined;
      const valid = single && (name === API_KEY_HEADER ? API_KEY_VALUE_RE : ENV_VAR_RE).test(single);
      if (!valid) errors.push({
        message: `${name} header must be an expanded environment variable${name === API_KEY_HEADER ? ' named COMPOSIO_API_KEY or COMPOSIO_<NAME>_API_KEY' : ''} (found ${JSON.stringify(wordText(value))})`,
        field: name,
      });
    }
    return errors;
  });
  if (results.some((errors) => errors.length === 0)) return;
  const closest = results.reduce((best, errors) => errors.length < best.length ? errors : best);
  for (const error of closest) report('api-key-header', error.message, error.field);
}

function hasDynamicKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDynamicKey);
  const object = jsonObject.safeParse(value);
  return object.success && Object.entries(object.data).some(([key, item]) => key.includes(SHELL) || hasDynamicKey(item));
}

function checkBody(curl: CurlCommand, operation: ApiOperation | undefined, operationLabel: string, report: Report) {
  const data = curl.get ? [] : curl.data;
  if (!data.length) {
    if (operation?.bodyRequired) report('api-body-schema', `${operationLabel} requires a JSON request body`);
    else if (operation?.bodySchema !== undefined) {
      try {
        for (const error of bodyErrors(operation, {})) {
          if (error.keyword === 'required') report('api-body-schema', `${operationLabel} missing JSON body: ${error.message}`, errorField(error));
        }
      } catch (error) {
        report('api-body-unchecked', `${operationLabel} request schema cannot be checked: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return;
  }
  if (operation && !operation.hasBody) report('api-body-schema', `${operationLabel} takes no request body`);
  const external = data.find(({ option, value }) =>
    option === '--upload-file' || option === '--data-urlencode' || option.startsWith('--form') ||
    (option !== '--data-raw' && wordText(value).startsWith('@')),
  );
  if (external) {
    report('api-body-unchecked', `${operationLabel} ${external.option} uses form, encoded, or file-backed data whose JSON body cannot be checked`);
    return;
  }
  const json = data.map(({ option, value }, index) => `${index > 0 && option !== '--json' ? '&' : ''}${bodyJson(value)}`).join('');
  let body: unknown;
  try {
    body = JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    report('api-json-invalid', `${operationLabel} body is not valid JSON: ${reason}`);
    return;
  }
  if (body === SHELL_VALUE || hasDynamicKey(body)) {
    report('api-body-unchecked', `${operationLabel} fully expanded body or expanded JSON property names cannot be checked`);
    return;
  }
  if (operation?.bodySchema === undefined) return;
  try {
    for (const error of bodyErrors(operation, body)) {
      const field = errorField(error);
      report('api-body-schema', `${operationLabel} ${field ? `"${field}"` : 'body'} ${error.message} (${error.keyword})`, field || undefined);
    }
  } catch (error) {
    report('api-body-unchecked', `${operationLabel} request schema cannot be checked: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const UNKNOWN_AUTH: Pick<ApiOperation, 'auth'> = {
  auth: ['x-api-key', 'x-user-api-key', 'x-org-api-key'].map((name) => ({ headers: [name], unsupported: [] })),
};

function checkCurl(curl: CurlCommand, url: ApiUrl, filePath: string, specs: ApiSpecs,
  emit: (rule: ApiSnippetRule, message: string, operation: string, field?: string) => void) {
  const version = /^\/api\/(v[^/]+)(?:\/|$)/.exec(url.path)?.[1];
  const spec = version === 'v3.1' ? specs.v3_1 : version === 'v3' ? specs.v3 : undefined;
  const found = spec ? findOperation(spec, url.parts, curl.method) : undefined;
  const operationLabel = `${curl.method} ${found?.template ?? url.path}`;
  const report: Report = (rule, message, field) => emit(rule, message, operationLabel, field);
  for (const issue of curl.issues) report('api-curl-unsupported', issue);
  if (url.origin !== CANONICAL_ORIGIN) report('api-base-url', `origin must be ${CANONICAL_ORIGIN} (found ${JSON.stringify(url.origin)})`);
  const v3Reference = filePath.startsWith('content/reference/v3/');
  if (version !== 'v3.1' && !(version === 'v3' && v3Reference)) {
    report('api-legacy-version', `${operationLabel} uses ${version ? `/api/${version}` : 'a missing API version'}; use ${CANONICAL_BASE}`);
  }
  if (spec && !found?.operation) {
    const hint = found?.allowed?.length ? `; the path allows ${found.allowed.join(', ')}` : '';
    report('api-unknown-operation', `${curl.method} ${url.path} is not an operation in ${spec.name}${hint}`);
  }
  checkAuth(curl, found?.operation ?? UNKNOWN_AUTH, report);
  checkBody(curl, found?.operation, operationLabel, report);
}

const EXEMPTIBLE_RULES: Record<string, true> = {
  'api-legacy-version': true, 'api-base-url': true, 'api-unknown-operation': true,
  'api-key-header': true, 'api-json-invalid': true, 'api-body-schema': true,
  'api-body-unchecked': true, 'api-curl-unsupported': true,
};

/** Every exception consumes only a matching diagnostic, never a fence or transfer. */
export function checkApiSnippets(files: readonly CodeExampleFile[], specs: ApiSpecs): ApiSnippetViolation[] {
  const violations: ApiSnippetViolation[] = [];
  for (const file of files) {
    walkCodeExamples(parseCodeExamples(file.source, file.path).units, (unit) => {
      if (unit.type !== 'fence') return;
      const markers = unit.markers.filter((marker) => marker.kind === 'unchecked-api');
      const used = new Set<MarkerUnit>();
      const valid = markers.filter((marker) => {
        if (marker.wellFormed && marker.reason?.trim() && marker.api && EXEMPTIBLE_RULES[marker.api.rule]) return true;
        violations.push({ path: file.path, line: marker.line, rule: 'api-exemption', message: 'unchecked-api requires a known rule, exact METHOD /operation, and a reason' });
        return false;
      });
      if (SHELL_LANGS[unit.lang]) for (const curl of parseCurlCommands(unit.code, unit.line + 1)) {
        for (const word of curl.urls) {
          const url = apiUrl(word);
          if (!url) continue;
          checkCurl(curl, url, file.path, specs, (rule, message, operation, field) => {
            const marker = valid.find((candidate) =>
              candidate.api?.rule === rule && candidate.api.operation === operation &&
              (candidate.api.field === undefined || candidate.api.field === field),
            );
            if (marker) used.add(marker);
            else violations.push({ path: file.path, line: curl.line, rule, message });
          });
        }
      }
      for (const marker of valid) if (!used.has(marker)) violations.push({
        path: file.path, line: marker.line, rule: 'api-exemption',
        message: `unchecked-api exception matched no diagnostic: ${marker.api?.rule} ${marker.api?.operation}${marker.api?.field ? ` field="${marker.api.field}"` : ''}`,
      });
    });
  }
  return violations.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message),
  );
}
