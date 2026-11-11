/**
 * The fake Composio deployment: one process that answers for every host the
 * `composio` binary talks to (backend, Dashboard, agents service, GitHub
 * releases, PostHog), keeps a journal of what it received, and can be told to
 * misbehave per route.
 */

import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import {
  describeFault,
  errorEnvelope,
  FaultController,
  HTML_ERROR_PAGE,
  MALFORMED_JSON_BODY,
  type Fault,
} from './faults';
import { identify, Journal, type RequestIdentity, type ServiceRole } from './journal';
import { matchPath, type Route, type RouteContext, type RouteResult } from './route';
import { ROUTES } from './routes';
import { tlsMaterial } from './tls';
import { World, type SeededProject } from './world';

/** The base URLs of the fake, as seen from one vantage point. */
export interface FakeUrls {
  /** `COMPOSIO_BASE_URL`, `COMPOSIO_AGENTS_BASE_URL`, `COMPOSIO_GITHUB_API_BASE_URL`, `COMPOSIO_GITHUB_URL`. */
  readonly http: string;
  /** `COMPOSIO_WEB_URL`. */
  readonly https: string;
  readonly posthog: string;
}

export interface FakeComposio {
  readonly world: World;
  readonly journal: Journal;
  readonly faults: FaultController;
  /** URLs a process on the host uses. */
  readonly host: FakeUrls;
  /** URLs a process inside a container uses. */
  readonly docker: FakeUrls;
  /** PEM certificate the Dashboard listener presents; trust it with `NODE_EXTRA_CA_CERTS`. */
  readonly caCert: string;
  /**
   * The environment that points every host the binary talks to at this fake.
   * `dashboard: false` leaves `COMPOSIO_WEB_URL` unset, which keeps consumer
   * executions on the backend transport.
   */
  readonly cliEnv: (options?: { dashboard?: boolean }) => Record<string, string>;
  readonly close: () => Promise<void>;
}

const roleOf = (path: string, viaTls: boolean): ServiceRole => {
  if (path.startsWith('/api/cli/trpc/')) return 'dashboard';
  if (path.startsWith('/api/v3/') || path.startsWith('/api/v3.1/')) return 'backend';
  if (path.startsWith('/api/')) return 'agents';
  if (path.startsWith('/repos/')) return 'github-api';
  if (path.includes('/releases/download/')) return 'github-download';
  if (path.startsWith('/posthog')) return 'posthog';
  return viaTls ? 'dashboard' : 'unknown';
};

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    request.on('end', () => resolve(new TextDecoder().decode(Buffer.concat(chunks))));
    request.on('error', reject);
  });

const parseJson = (text: string): unknown => {
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Kept as text so the journal still shows what arrived.
    return text;
  }
};

const toHeaders = (request: IncomingMessage): Headers => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
};

interface Planned {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array;
}

const plan = (result: RouteResult): Planned => {
  const status = result.status ?? 200;
  if (result.bytes !== undefined) {
    return {
      status,
      headers: { 'content-type': 'application/octet-stream', ...result.headers },
      body: result.bytes,
    };
  }
  if (result.text !== undefined) {
    return {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...result.headers },
      body: new TextEncoder().encode(result.text),
    };
  }
  return {
    status,
    headers: { 'content-type': 'application/json', ...result.headers },
    body: new TextEncoder().encode(result.json === undefined ? '' : JSON.stringify(result.json)),
  };
};

const jsonPlan = (status: number, json: unknown, headers: Record<string, string> = {}): Planned =>
  plan({ status, json, headers });

/** The answer a fault dictates. `null` drops the connection without a response. */
const distort = async (
  fault: Fault,
  honest: Planned
): Promise<{ planned: Planned; cutAfter?: number } | null> => {
  switch (fault.kind) {
    case 'status':
      return {
        planned: jsonPlan(
          fault.status,
          fault.body ??
            errorEnvelope({
              status: fault.status,
              message: fault.message ?? `Injected HTTP ${fault.status}`,
              slug: fault.slug ?? `Injected_${fault.status}`,
              code: fault.code,
            }),
          { ...fault.headers }
        ),
      };
    case 'delay':
      await Bun.sleep(fault.ms);
      return { planned: honest };
    case 'reset':
      return null;
    case 'reset-mid-body':
      return { planned: honest, cutAfter: Math.max(1, Math.floor(honest.body.length / 2)) };
    case 'malformed-json':
      return { planned: plan({ status: 200, text: MALFORMED_JSON_BODY, headers: honest.headers }) };
    case 'schema-drift': {
      const drifted = fault.transform(JSON.parse(new TextDecoder().decode(honest.body)));
      return { planned: jsonPlan(honest.status, drifted) };
    }
    case 'html':
      return {
        planned: plan({
          status: fault.status ?? 502,
          text: HTML_ERROR_PAGE,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      };
    case 'empty-body':
      return { planned: plan({ status: 200, json: undefined }) };
  }
};

const send = (response: ServerResponse, planned: Planned, cutAfter?: number): void => {
  response.writeHead(planned.status, {
    ...planned.headers,
    'content-length': String(planned.body.length),
  });
  if (cutAfter === undefined) {
    response.end(planned.body);
    return;
  }
  // The declared length is never delivered: the client sees the body end early.
  response.write(planned.body.subarray(0, cutAfter));
  setTimeout(() => response.socket?.destroy(), 50);
};

const labelled = (world: World, identity: RequestIdentity): SeededProject | undefined =>
  identity.project ? world.projectByLabel(identity.project) : undefined;

const authorize = (
  route: Route,
  identity: RequestIdentity,
  world: World
): { project: SeededProject | undefined } | { denied: Planned } => {
  if (route.auth === 'none') return { project: labelled(world, identity) };

  const unauthorized = (message: string): { denied: Planned } => ({
    denied: jsonPlan(401, errorEnvelope({ status: 401, message, slug: 'Auth_InvalidApiKey' })),
  });
  if (identity.keyClass === 'none') return unauthorized('No API key provided');
  if (!identity.keyKnown) return unauthorized('Invalid API key');

  if (route.auth === 'key') return { project: labelled(world, identity) };

  if (route.auth === 'user') {
    return identity.keyClass === 'user'
      ? { project: labelled(world, identity) }
      : unauthorized('This endpoint requires a user API key');
  }

  // A user key sent without `x-org-id` and `x-project-id` acts on the org's
  // default project, the one `auth/session/info` reports for that key.
  return { project: labelled(world, identity) ?? world.defaultProject };
};

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '0.0.0.0', port: 0 }, () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

/** Starts the fake on two free ports (HTTP, and HTTPS for the Dashboard). */
export const startFakeComposio = async (
  options: {
    routes?: ReadonlyArray<Route>;
    /** The one user API key this deployment issued; defaults to the seeded key. */
    userApiKey?: string;
  } = {}
): Promise<FakeComposio> => {
  const world = new World({ userApiKey: options.userApiKey });
  const journal = new Journal();
  const faults = new FaultController();
  // Suite-specific routes come first so they can shadow a seeded one.
  const routes = [...(options.routes ?? []), ...ROUTES];
  const tls = tlsMaterial();
  let urls: { host: FakeUrls; docker: FakeUrls } | undefined;

  const handler = (viaTls: boolean) => (request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://fake.invalid');
      const method = request.method ?? 'GET';
      const headers = toHeaders(request);
      const body = parseJson(await readBody(request));
      const identity = identify(headers, world);
      const role = roleOf(url.pathname, viaTls);

      let params: Record<string, string> = {};
      const route = routes.find(candidate => {
        if (candidate.method !== method) return false;
        const captured = matchPath(candidate.path, url.pathname);
        if (captured) params = captured;
        return captured !== undefined;
      });

      let acted: RouteResult['acted'];
      let effect: RouteResult['effect'];
      let tool: RouteResult['tool'];
      let scoped: SeededProject | undefined;
      const honest = (): Planned => {
        if (!route) {
          return jsonPlan(
            404,
            errorEnvelope({
              status: 404,
              message: `The fake backend has no route for ${method} ${url.pathname}`,
              slug: 'Fake_UnhandledRoute',
            })
          );
        }
        const access = authorize(route, identity, world);
        if ('denied' in access) return access.denied;
        if (route.auth === 'project') scoped = access.project;
        const context: RouteContext = {
          world,
          identity,
          params,
          query: url.searchParams,
          body,
          headers,
          urls: { backend: urls!.docker.http, dashboard: urls!.docker.https },
          project: access.project,
        };
        const result = route.handle(context);
        acted = result.acted;
        effect = result.effect;
        tool = result.tool;
        return plan(result);
      };

      const fault = faults.take(route?.name ?? null, method, url.pathname);
      // A fault that replaces the answer must not also let the route act.
      const replaces =
        fault !== undefined &&
        fault.kind !== 'delay' &&
        fault.kind !== 'schema-drift' &&
        fault.kind !== 'reset-mid-body';
      const honestPlan = replaces ? jsonPlan(200, {}) : honest();
      const outcome = fault ? await distort(fault, honestPlan) : { planned: honestPlan };

      journal.record({
        role,
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        route: route?.name ?? null,
        keyClass: identity.keyClass,
        keyKnown: identity.keyKnown,
        orgId: identity.orgId,
        project: acted?.project !== undefined ? acted.project : (scoped?.label ?? identity.project),
        requestedProject: identity.project,
        projectFrom:
          acted?.project !== undefined && acted.project !== identity.project
            ? 'route'
            : identity.project !== null
              ? identity.keyClass === 'project'
                ? 'project-key'
                : 'scope-headers'
              : scoped
                ? 'key-default'
                : null,
        userId: acted?.userId ?? null,
        body,
        status: outcome?.planned.status ?? 0,
        effect: effect ?? null,
        tool: tool ?? null,
        fault: fault ? describeFault(fault) : null,
      });

      if (outcome === null) {
        request.socket.destroy();
        return;
      }
      send(response, outcome.planned, outcome.cutAfter);
    })().catch(error => {
      // A handler bug must fail the test that triggered it, not hang the client.
      send(
        response,
        jsonPlan(
          500,
          errorEnvelope({
            status: 500,
            message: `Fake backend handler threw: ${error instanceof Error ? error.message : String(error)}`,
            slug: 'Fake_HandlerThrew',
          })
        )
      );
    });
  };

  const httpServer = createHttpServer(handler(false));
  const httpsServer = createHttpsServer({ key: tls.key, cert: tls.cert }, handler(true));
  const [httpPort, httpsPort] = await Promise.all([listen(httpServer), listen(httpsServer)]);

  const urlsFor = (hostname: string): FakeUrls => ({
    http: `http://${hostname}:${httpPort}`,
    https: `https://${hostname}:${httpsPort}`,
    posthog: `http://${hostname}:${httpPort}/posthog/i/v0/e/`,
  });
  urls = { host: urlsFor('localhost'), docker: urlsFor('host.docker.internal') };
  const docker = urls.docker;

  return {
    world,
    journal,
    faults,
    host: urls.host,
    docker,
    caCert: tls.cert,
    cliEnv: ({ dashboard = true } = {}) => ({
      COMPOSIO_BASE_URL: docker.http,
      ...(dashboard ? { COMPOSIO_WEB_URL: docker.https } : {}),
      COMPOSIO_AGENTS_BASE_URL: docker.http,
      COMPOSIO_GITHUB_API_BASE_URL: docker.http,
      COMPOSIO_GITHUB_URL: docker.http,
      COMPOSIO_POSTHOG_INGEST_URL: docker.posthog,
    }),
    close: async () => {
      await Promise.all([closeServer(httpServer), closeServer(httpsServer)]);
    },
  };
};
