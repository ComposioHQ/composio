/**
 * Shared fetch helper for docs generation scripts.
 *
 * Wraps the global `fetch` with rate-limit-aware retry/backoff:
 * - Retries `429 Too Many Requests` and transient 5xx responses.
 * - Honors the `Retry-After` header (delta-seconds or HTTP-date) when present.
 * - Falls back to exponential backoff with full jitter.
 * - Logs the endpoint and retry count so CI logs explain the delay.
 * - Caps attempts so CI still fails fast when the backend is genuinely down —
 *   the final failing `Response` is returned to the caller, which keeps existing
 *   `if (!response.ok)` handling intact.
 *
 * Network-level errors thrown by `fetch` (DNS, connection reset, …) are retried
 * the same way and re-thrown once attempts are exhausted.
 *
 * Why this exists: `generate-toolkits.ts` issues ~6500 requests per run (3 per
 * toolkit across a ~2.1k catalog), which exceeds the staging limit of 2000
 * requests/minute. Without backoff the run
 * fails with `429`, and `generate-meta-tools.ts` (which runs next) inherits the
 * exhausted window. See docs/scripts/README.md.
 *
 * Deliberately hand-rolled rather than using Effect's `Schedule` (which would be
 * the idiomatic fit elsewhere): the docs package has no Effect dependency and
 * these are plain bun scripts. Effect is reserved for `ts/packages/cli`. Keep
 * this helper dependency-free.
 */

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504];

export interface FetchWithRetryOptions extends RequestInit {
  /** Maximum number of attempts, including the first. Default 6. */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default 1000. */
  baseDelayMs?: number;
  /** Upper bound for a single backoff wait in ms. Default 60000. */
  maxDelayMs?: number;
  /** HTTP status codes that trigger a retry. Default [429, 500, 502, 503, 504]. */
  retryStatuses?: number[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms, or null. */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

/** Exponential backoff with full jitter. `attempt` is 1-based. */
function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

/** Collapse a URL to `origin + pathname` for tidy log lines (drops query noise). */
function loggableEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxAttempts = 6,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    ...init
  } = options;

  const endpoint = loggableEndpoint(url);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `  [fetch] ${endpoint} network error (attempt ${attempt}/${maxAttempts}), ` +
          `retrying in ${Math.round(delay)}ms: ${(error as Error).message}`
      );
      await sleep(delay);
      continue;
    }

    // Success, or a non-retryable status: hand it back to the caller.
    if (!retryStatuses.includes(response.status)) {
      return response;
    }

    // Out of attempts: surface the failing response so callers still fail.
    if (attempt >= maxAttempts) {
      return response;
    }

    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    // Add jitter on top of Retry-After to avoid a synchronized retry burst.
    const delay =
      retryAfterMs != null
        ? retryAfterMs + Math.random() * 1000
        : backoffDelay(attempt, baseDelayMs, maxDelayMs);

    console.warn(
      `  [fetch] ${endpoint} -> ${response.status} (attempt ${attempt}/${maxAttempts}), ` +
        `retrying in ${Math.round(delay)}ms${retryAfterMs != null ? ' (Retry-After)' : ''}`
    );

    // Drain the body so the connection can be reused.
    await response.arrayBuffer().catch(() => {});
    await sleep(delay);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`fetchWithRetry: exhausted ${maxAttempts} attempts for ${endpoint}`);
}
