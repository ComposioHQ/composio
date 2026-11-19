import { Auth, Composio, createFetchTransport, type ClientOptions } from '@composio/client';
import { paginate } from '@composio/client/pagination';

/**
 * Tools per page. Next.js does not cache an entry over 2 MiB, and when that
 * write fails it keeps serving the previously cached response. An entry holds
 * the body base64-encoded, so a response must stay under about 1.5 MiB. At 25
 * the largest production tools page measured 1.23 MB (Tableau, a 1.64 MB
 * entry); one Tableau tool dominates it, so a smaller page barely helps.
 */
export const TOOL_PAGE_SIZE = 25;

/** Toolkits per page. At 500 the largest production page measured 404 KB. */
export const TOOLKIT_PAGE_SIZE = 500;

/** The most items one list request returns; the API caps `limit` here. */
export const API_PAGE_LIMIT = 1000;

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ComposioClientOptions {
  /**
   * Seconds a response stays fresh in the Next.js Data Cache. Leave it unset
   * outside Next.js; each page of a list is cached as its own entry.
   */
  revalidate?: number;
  /** Retries for idempotent requests; the client defaults to 2. */
  maxRetries?: number;
  /** Milliseconds one request may take, including a custom `fetch`'s own retries. */
  timeout?: number;
  fetch?: Fetch;
}

function clientOverrides({ revalidate, maxRetries, timeout, fetch }: ComposioClientOptions) {
  return {
    transport: createFetchTransport({
      fetch,
      defaults: revalidate === undefined ? undefined : { next: { revalidate } },
    }),
    ...(maxRetries === undefined ? {} : { maxRetries }),
    ...(timeout === undefined ? {} : { timeout }),
  } satisfies Partial<ClientOptions>;
}

/**
 * A production API client authenticated with a project API key. For callers
 * that must reach production whatever the environment says: the generators,
 * the Instant toolkit list, and the snapshot-miss toolkit lookup.
 */
export function createComposioClient(apiKey: string, options: ComposioClientOptions = {}): Composio {
  return new Composio({ auth: Auth.project(apiKey), ...clientOverrides(options) });
}

/**
 * A client configured by `Composio.fromEnv`: credentials from `COMPOSIO_API_KEY`
 * and the API host from `COMPOSIO_BASE_URL`, defaulting to production.
 */
export function createComposioClientFromEnv(
  environment: Readonly<Record<string, string | undefined>>,
  options: ComposioClientOptions = {}
): Composio {
  return Composio.fromEnv(environment, clientOverrides(options));
}

interface ListOptions {
  pageSize?: number;
  /** Aborts the whole traversal, not one page. */
  signal?: AbortSignal;
}

/** Every tool of a toolkit's latest version, with pricing. */
export function listToolkitTools(
  client: Composio,
  toolkitSlug: string,
  { pageSize = TOOL_PAGE_SIZE, signal }: ListOptions = {}
) {
  return paginate(({ cursor }) =>
    client.tools.list(
      {
        toolkit_slug: toolkitSlug.toUpperCase(),
        toolkit_versions: 'latest',
        include_pricing: true,
        limit: pageSize,
        cursor,
      },
      { signal }
    )
  ).toArray();
}

/** Every trigger type of a toolkit's latest version. */
export function listToolkitTriggers(
  client: Composio,
  toolkitSlug: string,
  { pageSize = TOOL_PAGE_SIZE, signal }: ListOptions = {}
) {
  return paginate(({ cursor }) =>
    client.triggersTypes.list(
      { toolkit_slugs: [toolkitSlug.toUpperCase()], toolkit_versions: 'latest', limit: pageSize, cursor },
      { signal }
    )
  ).toArray();
}

/** Every toolkit in the catalog. Instant eligibility arrives without `include_pricing`. */
export function listToolkits(
  client: Composio,
  { pageSize = TOOLKIT_PAGE_SIZE, signal }: ListOptions = {}
) {
  return paginate(({ cursor }) =>
    client.toolkits.list({ limit: pageSize, cursor }, { signal })
  ).toArray();
}
