/**
 * @fileoverview Generic API deprecation interceptor for the Composio SDK.
 *
 * The Composio API signals deprecated endpoints using standard HTTP response
 * headers. This module provides a `fetch` wrapper that inspects those headers
 * on EVERY response and emits a one-time warning per operation. Because the
 * detection is header-driven and endpoint-agnostic, any endpoint the API
 * deprecates in the future is surfaced automatically, with no SDK release
 * required.
 *
 * Headers understood (pinned, stable format from the platform):
 *  - `Deprecation: @<unix-epoch-seconds>` (RFC 9745) — presence marks the
 *    operation as deprecated. The value is a Structured-Field date (e.g.
 *    `@1782345600`), NOT the string "true"; only presence gates the warning,
 *    while the epoch is parsed into `deprecatedAt` when available.
 *  - `Sunset: <HTTP-date>` (RFC 8594) — optional removal date. Drives the
 *    escalation wording (upcoming vs. already past).
 *  - `Link: <url>; rel="successor-version"` (RFC 8288/5829) — optional pointer
 *    to the replacement endpoint. May instead be `rel="deprecation"` for a
 *    docs/changelog link.
 *
 * @module utils/deprecation
 */
import logger from './logger';

/**
 * A `fetch`-compatible function signature. Matches the shape accepted by the
 * generated `@composio/client` `fetch` option and the global `fetch`.
 */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Structured description of a deprecated operation, passed to the optional
 * `onDeprecation` hook so applications can route deprecations to their own
 * telemetry.
 */
export interface DeprecationInfo {
  /** Upper-case HTTP method, e.g. `POST`. */
  method: string;
  /** Normalized route template with dynamic path params collapsed, e.g. `/api/v3/connected_accounts/{param}`. */
  path: string;
  /** When the operation was marked deprecated (parsed from `Deprecation: @<epoch>`), or `null` if not parseable. */
  deprecatedAt: Date | null;
  /** Committed removal date (parsed from `Sunset`), or `null` when the header is absent/invalid. */
  sunset: Date | null;
  /** Replacement endpoint or migration docs URL (from `Link`), or `null`. */
  successor: string | null;
}

/**
 * Options for {@link createDeprecationInterceptor}.
 */
export interface DeprecationWarningsOptions {
  /** When true, no warnings are logged and no callback is fired. */
  disabled?: boolean;
  /** Optional hook invoked once per deprecated operation with structured details. */
  onDeprecation?: (info: DeprecationInfo) => void;
  /** Underlying fetch to delegate to. Defaults to the global `fetch`. */
  baseFetch?: FetchLike;
}

/** Milliseconds in a day, used for the "sunset is near" escalation threshold. */
const DAY_MS = 24 * 60 * 60 * 1000;
/** How close a sunset date must be (in the future) to escalate the wording. */
const SUNSET_NEAR_THRESHOLD_MS = 30 * DAY_MS;

/**
 * Parses the `Deprecation` header value. Per RFC 9745 it is a Structured-Field
 * date such as `@1782345600` (seconds since the Unix epoch). Returns the parsed
 * `Date`, or `null` for absent/`"true"`/otherwise unparseable values — callers
 * gate the warning on header *presence*, not on this returning a value.
 */
export function parseDeprecationDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  // RFC 9745 sf-date: an "@" followed by integer seconds.
  const match = trimmed.match(/^@(-?\d+)$/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) {
    return null;
  }
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parses an RFC 8594 `Sunset` header (an HTTP-date) into a `Date`, or `null`
 * when absent/invalid.
 */
export function parseSunsetDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parses an RFC 8288 `Link` header, extracting the `successor-version` URL (the
 * replacement endpoint) and the `deprecation` URL (docs/changelog) when present.
 */
export function parseLinkHeader(linkHeader: string | null | undefined): {
  successor: string | null;
  deprecation: string | null;
} {
  const result: { successor: string | null; deprecation: string | null } = {
    successor: null,
    deprecation: null,
  };
  if (!linkHeader) {
    return result;
  }

  // Link headers are comma-separated lists of `<uri>; param=value; ...` entries.
  for (const entry of linkHeader.split(',')) {
    const match = entry.match(/<([^>]*)>\s*;\s*(.*)/s);
    if (!match) {
      continue;
    }
    const url = match[1].trim();
    const params = match[2];
    if (result.successor === null && /rel\s*=\s*"?successor-version"?/i.test(params)) {
      result.successor = url;
    } else if (result.deprecation === null && /rel\s*=\s*"?deprecation"?/i.test(params)) {
      result.deprecation = url;
    }
  }

  return result;
}

/**
 * Collapses dynamic path segments (ids, uuids, nanoids, versions) to `{param}`
 * so repeated calls with different path params dedupe to a single warning.
 */
export function normalizePathTemplate(pathname: string): string {
  const segments = pathname
    .split('/')
    .map(segment => (isDynamicSegment(segment) ? '{param}' : segment));
  return segments.join('/');
}

/** Heuristic for whether a single path segment is a dynamic parameter. */
function isDynamicSegment(segment: string): boolean {
  if (!segment) {
    return false;
  }
  // UUID.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return true;
  }
  // Purely numeric id.
  if (/^\d+$/.test(segment)) {
    return true;
  }
  // A digit is the distinguishing mark of an id vs. a static snake_case resource
  // name (`connected_accounts`, `auth_configs`, …), which never contain digits.
  const hasDigit = /\d/.test(segment);
  // Prefixed id such as `ca_1a2b3c`, `conn_abc123`.
  if (hasDigit && /^[a-z]{1,12}_[A-Za-z0-9]{4,}$/i.test(segment)) {
    return true;
  }
  // Long, random-looking token with both letters and digits (nanoid-style).
  if (hasDigit && segment.length >= 16 && /[A-Za-z]/.test(segment)) {
    return true;
  }
  return false;
}

/** Builds the developer-facing warning message, escalating on the sunset date. */
function buildDeprecationMessage(
  operation: string,
  sunset: Date | null,
  rawSunset: string | null,
  link: { successor: string | null; deprecation: string | null },
  now: number
): string {
  const parts = [`[Composio][Deprecation] The API operation \`${operation}\` is deprecated.`];

  if (sunset) {
    const sunsetLabel = rawSunset ?? sunset.toUTCString();
    const delta = sunset.getTime() - now;
    if (delta <= 0) {
      parts.push(
        `It was scheduled for removal on ${sunsetLabel} and may already be unavailable — migrate now.`
      );
    } else if (delta <= SUNSET_NEAR_THRESHOLD_MS) {
      const days = Math.max(1, Math.ceil(delta / DAY_MS));
      parts.push(
        `It will be removed on ${sunsetLabel} (in ${days} day${days === 1 ? '' : 's'}) — migrate now.`
      );
    } else {
      parts.push(`It is scheduled for removal on ${sunsetLabel}.`);
    }
  } else if (rawSunset) {
    // Present but unparseable: surface the raw value rather than dropping it.
    parts.push(`It is scheduled for removal on ${rawSunset}.`);
  } else {
    parts.push('It may be removed in a future release.');
  }

  if (link.successor) {
    parts.push(`Use ${link.successor} instead.`);
  } else if (link.deprecation) {
    parts.push(`See ${link.deprecation} for migration details.`);
  }

  return parts.join(' ');
}

/** Derives the `METHOD /normalized/path` operation key for a request. */
function getOperationKey(input: string | URL | Request, init?: RequestInit): string {
  let rawUrl: string;
  let method = init?.method;

  if (typeof input === 'string') {
    rawUrl = input;
  } else if (input instanceof URL) {
    rawUrl = input.toString();
  } else {
    rawUrl = input.url;
    method = method ?? input.method;
  }

  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    // Relative or unparsable URL: fall back to the raw value.
  }

  return `${(method ?? 'GET').toUpperCase()} ${normalizePathTemplate(pathname)}`;
}

/**
 * Creates a `fetch` wrapper that inspects every response for API deprecation
 * headers, warning once per operation and (optionally) invoking a structured
 * callback. The returned function is a drop-in replacement for the `fetch`
 * option of the generated client.
 *
 * The interceptor never alters the request or response and never throws: any
 * failure while inspecting headers is swallowed so deprecation handling can
 * never affect real API traffic.
 */
export function createDeprecationInterceptor(options: DeprecationWarningsOptions = {}): FetchLike {
  const { disabled = false, onDeprecation, baseFetch } = options;
  const doFetch: FetchLike = baseFetch ?? ((input, init) => globalThis.fetch(input, init));
  // Per-interceptor guard so one deprecated operation warns once for the
  // lifetime of a client, even across many calls with different path params.
  const warnedOperations = new Set<string>();

  return async (input, init) => {
    const response = await doFetch(input, init);

    if (disabled) {
      return response;
    }

    try {
      const headers = response.headers;
      // RFC 9745: only presence matters for whether to warn.
      if (!headers.has('deprecation')) {
        return response;
      }

      const [method, path] = splitOperationKey(getOperationKey(input, init));
      const operation = `${method} ${path}`;
      if (warnedOperations.has(operation)) {
        return response;
      }
      warnedOperations.add(operation);

      const rawSunset = headers.get('sunset');
      const sunset = parseSunsetDate(rawSunset);
      const link = parseLinkHeader(headers.get('link'));
      const deprecatedAt = parseDeprecationDate(headers.get('deprecation'));

      logger.warn(buildDeprecationMessage(operation, sunset, rawSunset, link, Date.now()));

      if (onDeprecation) {
        try {
          onDeprecation({
            method,
            path,
            deprecatedAt,
            sunset,
            successor: link.successor ?? link.deprecation ?? null,
          });
        } catch {
          // A misbehaving callback must never affect the request.
        }
      }
    } catch {
      // Never let deprecation inspection interfere with the actual request.
    }

    return response;
  };
}

/** Splits a `METHOD path` key back into its two parts (path may contain spaces defensively). */
function splitOperationKey(key: string): [string, string] {
  const spaceIndex = key.indexOf(' ');
  if (spaceIndex === -1) {
    return ['GET', key];
  }
  return [key.slice(0, spaceIndex), key.slice(spaceIndex + 1)];
}
