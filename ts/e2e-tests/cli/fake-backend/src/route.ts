/**
 * The route model of the fake backend: how a request finds its handler, and
 * what a handler may say about the request it served.
 */

import { errorEnvelope } from './faults';
import type { RequestIdentity, ServiceRole } from './journal';
import type { SeededProject, World } from './world';

/** The base URLs the binary under test reaches the fake at, for links in response bodies. */
export interface PublicUrls {
  readonly backend: string;
  readonly dashboard: string;
}

export interface RouteContext {
  readonly world: World;
  readonly identity: RequestIdentity;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  /** The parsed JSON body, or `undefined` when there is none. Parse it with zod before use. */
  readonly body: unknown;
  readonly headers: Headers;
  readonly urls: PublicUrls;
  /** The project the request is scoped to; set for `auth: 'project'` routes. */
  readonly project: SeededProject | undefined;
}

export type RouteEffect = 'tool-executed' | 'connection-started';

export interface RouteResult {
  readonly status?: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly bytes?: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * What the request changed, when it changed something. A Dashboard execution
   * answers 200 whether or not the tool ran, so a status alone cannot tell.
   */
  readonly effect?: RouteEffect;
  /** Overrides the journal's project and user for this request (a session implies both). */
  readonly acted?: { readonly project?: string | null; readonly userId?: string | null };
}

/**
 * Who may call a route.
 *
 * - `none`: no credential needed.
 * - `user`: the seeded user API key.
 * - `key`: any credential the world issued; catalog reads need no project.
 * - `project`: a project API key, or the user API key with `x-org-id` and `x-project-id`.
 */
export type RouteAuth = 'none' | 'user' | 'key' | 'project';

export interface Route {
  /**
   * The client operation the route implements (`toolRouter.session.execute`),
   * or a name of its own for endpoints `@composio/client` does not type.
   */
  readonly name: string;
  readonly role: ServiceRole;
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template; `:name` captures one segment. `/api/:v/` accepts `v3` and `v3.1`. */
  readonly path: string;
  /**
   * Whether `name` is a key of the client's response schema table, which the
   * contract test decodes this route's success response with.
   */
  readonly typed: boolean;
  readonly auth: RouteAuth;
  readonly handle: (context: RouteContext) => RouteResult;
}

const API_VERSIONS = new Set(['v3', 'v3.1']);

/** The captures of `path` against `template`, or `undefined` when it does not match. */
export const matchPath = (template: string, path: string): Record<string, string> | undefined => {
  const wanted = template.split('/');
  const actual = path.split('/');
  if (wanted.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, segment] of wanted.entries()) {
    const value = actual[index] ?? '';
    if (segment.startsWith(':')) {
      if (value === '') return undefined;
      if (segment === ':v' && !API_VERSIONS.has(value)) return undefined;
      params[segment.slice(1)] = decodeURIComponent(value);
    } else if (segment !== value) {
      return undefined;
    }
  }
  return params;
};

export const notFound = (message: string, slug = 'Resource_NotFound'): RouteResult => ({
  status: 404,
  json: errorEnvelope({ status: 404, message, slug }),
});

export const badRequest = (message: string, slug = 'Request_Invalid'): RouteResult => ({
  status: 400,
  json: errorEnvelope({ status: 400, message, slug }),
});

/** One page holding every item: the seeded lists never need a second one. */
export const singlePage = <T>(items: ReadonlyArray<T>) => ({
  items,
  next_cursor: null,
  total_pages: 1,
  current_page: 1,
  total_items: items.length,
});
