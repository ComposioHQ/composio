/**
 * Toolkit version deprecation warnings.
 *
 * When a request resolves to a deprecated toolkit version, the API adds a
 * `Composio-Deprecated-Toolkits` response header (an RFC 9651 structured-field
 * list). This module parses that header below the generated client, through a
 * `fetch` wrapper, and warns once per process for each deprecated toolkit
 * version it sees. The response itself is never read, cloned or altered.
 *
 * Example header:
 *
 *   "GMAIL";version="20250114_00";deprecated=@1779840000;sunset=@1787788800;reason="lifecycle"
 */
import { z } from 'zod';
import logger from './logger';
import { normalizeToolkitSlug } from './toolkitVersion';

/** Response header name. `Headers.get` is case-insensitive. */
export const TOOLKIT_DEPRECATION_HEADER = 'composio-deprecated-toolkits';

/** Anchor of the docs section every warning points at. */
export const TOOLKIT_DEPRECATION_DOCS_URL =
  'https://docs.composio.dev/docs/tools-direct/toolkit-versioning#deprecation-and-sunset';

/** Versions named per toolkit before the formatter collapses the rest into "and N more". */
const MAX_VERSIONS_PER_LINE = 5;

/**
 * The three limits below mirror the `@composio/client` deprecation module,
 * which reads the same kind of server-controlled header.
 */
/** A header longer than this is ignored whole rather than parsed. */
const MAX_HEADER_LENGTH = 2048;
/** A header holding any of these is ignored whole, so nothing partially cleaned reaches the log. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
/** Keys the process will ever record; past this, new versions are neither recorded nor warned about. */
const MAX_TRACKED_VERSIONS = 1024;

export const DeprecatedToolkitEntrySchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  deprecatedAt: z.date().optional(),
  sunsetAt: z.date().optional(),
  reason: z.string().min(1).optional(),
});

export type DeprecatedToolkitEntry = z.infer<typeof DeprecatedToolkitEntrySchema>;

/** Keys (`UPPER(slug)@version`) already warned about in this process. */
const warnedToolkitVersions = new Set<string>();

const dedupeKey = (entry: Pick<DeprecatedToolkitEntry, 'slug' | 'version'>): string =>
  `${entry.slug.toUpperCase()}@${entry.version}`;

/**
 * Splits `value` on `delimiter` characters that sit outside double-quoted
 * strings, honouring backslash escapes inside the quotes. Empty pieces are
 * dropped and the rest are trimmed.
 */
const splitOutsideQuotes = (value: string, delimiter: string): string[] => {
  const pieces: string[] = [];
  let current = '';
  let inString = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      current += char;
      if (char === '\\' && index + 1 < value.length) {
        index += 1;
        current += value[index];
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
      current += char;
    } else if (char === delimiter) {
      pieces.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  pieces.push(current);
  return pieces.map(piece => piece.trim()).filter(piece => piece.length > 0);
};

/**
 * Decodes an sf-string (`"..."` with `\"` and `\\` escapes). Returns
 * `undefined` for anything that is not a complete, validly escaped sf-string.
 */
const decodeSfString = (raw: string): string | undefined => {
  const match = /^"((?:[^"\\]|\\.)*)"$/.exec(raw);
  if (match === null) return undefined;
  let invalidEscape = false;
  const decoded = match[1].replace(/\\(.)/g, (_whole, escaped: string) => {
    if (escaped === '"' || escaped === '\\') return escaped;
    invalidEscape = true;
    return '';
  });
  return invalidEscape ? undefined : decoded;
};

/** Decodes an sf-date (`@` followed by Unix seconds). */
const decodeSfDate = (raw: string): Date | undefined => {
  const match = /^@(-?\d{1,15})$/.exec(raw);
  if (match === null) return undefined;
  const date = new Date(Number(match[1]) * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Header parameters the SDK understands, by wire name. */
const KNOWN_PARAMETERS = new Map<
  string,
  { name: keyof DeprecatedToolkitEntry; kind: 'string' | 'date' }
>([
  ['version', { name: 'version', kind: 'string' }],
  ['reason', { name: 'reason', kind: 'string' }],
  ['deprecated', { name: 'deprecatedAt', kind: 'date' }],
  ['sunset', { name: 'sunsetAt', kind: 'date' }],
]);

/**
 * Parses one list item: an sf-string slug followed by `;key=value` parameters.
 * Unknown parameters are ignored; a known parameter with the wrong type drops
 * the item.
 */
const parseItem = (item: string): DeprecatedToolkitEntry | undefined => {
  const [head, ...params] = splitOutsideQuotes(item, ';');
  if (head === undefined) return undefined;
  const candidate: Record<string, unknown> = { slug: decodeSfString(head) };
  for (const param of params) {
    const separator = param.indexOf('=');
    const key = (separator === -1 ? param : param.slice(0, separator)).trim();
    const rawValue = separator === -1 ? undefined : param.slice(separator + 1).trim();
    if (rawValue === undefined) continue;
    const field = KNOWN_PARAMETERS.get(key);
    if (field === undefined) continue;
    const decoded = field.kind === 'string' ? decodeSfString(rawValue) : decodeSfDate(rawValue);
    // A known parameter with the wrong type invalidates the whole item.
    if (decoded === undefined) return undefined;
    candidate[field.name] = decoded;
  }
  const parsed = DeprecatedToolkitEntrySchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
};

/**
 * Parses a `Composio-Deprecated-Toolkits` header value. Items that fail to
 * parse are dropped silently; garbage input yields an empty array. Never throws.
 */
export function parseDeprecatedToolkitsHeader(value: string): DeprecatedToolkitEntry[] {
  try {
    const entries: DeprecatedToolkitEntry[] = [];
    for (const item of splitOutsideQuotes(value, ',')) {
      const entry = parseItem(item);
      if (entry !== undefined) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const pinHint = (slug: string, docsUrl: string): string => {
  const configKey = normalizeToolkitSlug(slug);
  const envVar = `COMPOSIO_TOOLKIT_VERSION_${slug.toUpperCase()}`;
  return `Pin a newer version with toolkitVersions: { ${configKey}: '<version>' } or ${envVar}. See ${docsUrl}.`;
};

const formatSingle = (entry: DeprecatedToolkitEntry, docsUrl: string): string => {
  let sentence = `[Deprecation] Toolkit ${entry.slug.toUpperCase()} version ${entry.version} was deprecated`;
  if (entry.deprecatedAt !== undefined) sentence += ` on ${isoDate(entry.deprecatedAt)}`;
  if (entry.reason !== undefined) sentence += ` (${entry.reason})`;
  if (entry.sunsetAt !== undefined)
    sentence += ` and will stop working on ${isoDate(entry.sunsetAt)}`;
  return `${sentence}. ${pinHint(entry.slug, docsUrl)}`;
};

const formatGroup = (slug: string, entries: DeprecatedToolkitEntry[], docsUrl: string): string => {
  const versions = entries.map(entry => entry.version);
  const named = versions.slice(0, MAX_VERSIONS_PER_LINE).join(', ');
  const remaining = versions.length - MAX_VERSIONS_PER_LINE;
  const list = remaining > 0 ? `${named} and ${remaining} more` : named;
  let sentence = `[Deprecation] Toolkit ${slug} versions ${list} are deprecated`;
  const sunsets = entries
    .map(entry => entry.sunsetAt)
    .filter((date): date is Date => date !== undefined)
    .sort((a, b) => a.getTime() - b.getTime());
  if (sunsets.length > 0) {
    sentence += ` and the earliest will stop working on ${isoDate(sunsets[0])}`;
  }
  return `${sentence}. ${pinHint(slug, docsUrl)}`;
};

/**
 * Renders one warning line per toolkit slug. A slug with a single deprecated
 * version gets the full sentence with its dates and reason; a slug with several
 * names at most five versions and collapses the rest into "and N more".
 */
export function formatToolkitDeprecationWarnings(
  entries: DeprecatedToolkitEntry[],
  docsUrl: string = TOOLKIT_DEPRECATION_DOCS_URL
): string[] {
  const groups = new Map<string, DeprecatedToolkitEntry[]>();
  for (const entry of entries) {
    const slug = entry.slug.toUpperCase();
    const group = groups.get(slug);
    if (group === undefined) groups.set(slug, [entry]);
    else group.push(entry);
  }
  return Array.from(groups, ([slug, group]) =>
    group.length === 1 ? formatSingle(group[0], docsUrl) : formatGroup(slug, group, docsUrl)
  );
}

/**
 * Parses the header on `response`, drops versions already warned about in this
 * process, records the new ones and warns once per formatted line.
 */
const warnDeprecatedToolkits = (response: Response): void => {
  const value = response.headers.get(TOOLKIT_DEPRECATION_HEADER);
  if (value === null || value.length === 0) return;
  if (value.length > MAX_HEADER_LENGTH || CONTROL_CHARACTERS.test(value)) return;
  const fresh: DeprecatedToolkitEntry[] = [];
  for (const entry of parseDeprecatedToolkitsHeader(value)) {
    const key = dedupeKey(entry);
    if (warnedToolkitVersions.has(key) || warnedToolkitVersions.size >= MAX_TRACKED_VERSIONS)
      continue;
    warnedToolkitVersions.add(key);
    fresh.push(entry);
  }
  for (const line of formatToolkitDeprecationWarnings(fresh)) {
    logger.warn(line);
  }
};

/**
 * Wraps a `fetch` implementation so every response is checked for the
 * `Composio-Deprecated-Toolkits` header. The wrapper is `this`-independent,
 * returns the response unchanged on every path and never fails a call over
 * the header: any error while inspecting it is logged at debug and swallowed.
 *
 * When no `baseFetch` is given, `globalThis.fetch` is resolved per call so a
 * runtime that installs or replaces `fetch` after construction still works.
 */
export function createToolkitDeprecationFetch(
  baseFetch?: typeof globalThis.fetch
): typeof globalThis.fetch {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = baseFetch ?? globalThis.fetch;
    const response = await target(input, init);
    try {
      warnDeprecatedToolkits(response);
    } catch (error) {
      try {
        logger.debug('Failed to inspect the toolkit deprecation header', error);
      } catch {
        // The fallback is best-effort too: a sink that throws must not fail the call.
      }
    }
    return response;
  };
  return wrapped;
}

/** Clears the once-per-process record. Tests only. */
export function _resetToolkitDeprecationWarningsForTests(): void {
  warnedToolkitVersions.clear();
}
