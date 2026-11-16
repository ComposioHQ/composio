import { Auth, make, type ComposioClientShape } from '@composio/client/effect';
import { Effect, Layer, Result } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { schemaLoaders } from '@composio/client/effect/schemas';

/** One request as it reached the stub transport. */
export interface StubRequest {
  readonly method: string;
  /** Path and query, without the origin. */
  readonly path: string;
  /** The JSON body, or `undefined` when the request carried none. */
  readonly body: unknown;
}

/**
 * The org and project a stubbed request carried in its scope headers (`x-org-id`,
 * `x-project-id`), as the client sends them for a client built with `scope`; both are absent
 * for a client built without one.
 */
export interface StubRequestScope {
  readonly orgId?: string;
  readonly projectId?: string;
}

/** The scope a client is built with: an org and a project together, as `getFor` takes them. */
type StubClientScope = { readonly orgId: string; readonly projectId: string };

/**
 * A transport that records each request, and the scope headers it carried, and answers it
 * with `respond`. `scopes[i]` is the scope of `requests[i]`.
 */
const recordingTransport = (respond: (request: StubRequest) => Response) => {
  const requests: Array<StubRequest> = [];
  const scopes: Array<StubRequestScope> = [];
  const httpClient = HttpClient.make(request =>
    Effect.promise(async () => {
      const web = Result.getOrThrow(HttpClientRequest.toWebResult(request));
      const url = new URL(web.url);
      const text = await web.text();
      const recorded: StubRequest = {
        method: web.method,
        path: `${url.pathname}${url.search}`,
        body: text === '' ? undefined : (JSON.parse(text) as unknown),
      };
      const orgId = web.headers.get('x-org-id');
      const projectId = web.headers.get('x-project-id');
      requests.push(recorded);
      scopes.push({
        ...(orgId === null ? {} : { orgId }),
        ...(projectId === null ? {} : { projectId }),
      });
      return HttpClientResponse.fromWeb(request, respond(recorded));
    })
  );
  return { httpClient, requests, scopes };
};

const makeStubClient = (httpClient: HttpClient.HttpClient, scope?: StubClientScope) =>
  make(
    {
      auth: Auth.project('test'),
      scope:
        scope === undefined
          ? undefined
          : { organizationId: scope.orgId, projectId: scope.projectId },
      baseURL: 'https://stub.invalid',
      maxRetries: 0,
      schemas: schemaLoaders,
    },
    httpClient
  );

/**
 * The Effect client the CLI builds in production, over a transport that
 * records each request and answers it with `respond`. Retries, status errors,
 * and the validation a call asks for are the client's own.
 *
 * A retried call sleeps on Effect's clock, so a test whose answer is retryable
 * runs on the live clock (`it.live`, or `layer(..., { excludeTestServices: true })`)
 * and answers with a `retry-after-ms: 0` header.
 */
export const stubComposioClient = (
  respond: (request: StubRequest) => Response
): { readonly client: ComposioClientShape; readonly requests: ReadonlyArray<StubRequest> } => {
  const { httpClient, requests } = recordingTransport(respond);
  return { client: makeStubClient(httpClient), requests };
};

/**
 * A layer over a test layer's `ComposioClientSingleton` that swaps the named
 * resources of every client it hands out for those of a client built by
 * {@link stubComposioClient}, with the org and project the client was asked
 * for. Calls to those resources go through the real client to `respond`;
 * every other resource keeps the test layer's answers. `scopes[i]` holds the
 * scope headers `requests[i]` carried, so a test can tell which project a
 * request named.
 *
 * The test layer's answers do not model request options (`signal`,
 * `maxRetries`, or any header beyond `decode`), and its connected-account
 * shadows serve fixtures without cursor traversal, so pagination, retries, and abort are
 * exercised through {@link stubComposioClient}, the real `make` over a
 * recording transport.
 */
export const stubClientResources = (
  resources: ReadonlyArray<keyof ComposioClientShape>,
  respond: (request: StubRequest) => Response
) => {
  const transport = recordingTransport(respond);
  const overlayFor = (scope?: StubClientScope) => {
    const client = makeStubClient(transport.httpClient, scope);
    return Object.fromEntries(resources.map(resource => [resource, client[resource]]));
  };
  const unscoped = overlayFor();
  const stubbed =
    (overlay: ReturnType<typeof overlayFor>) =>
    (client: ComposioClientShape): ComposioClientShape => ({ ...client, ...overlay });
  const layer = Layer.effect(
    ComposioClientSingleton,
    Effect.gen(function* () {
      const base = yield* ComposioClientSingleton;
      return ComposioClientSingleton.of({
        ...base,
        get: () => Effect.map(base.get(), stubbed(unscoped)),
        getFor: params =>
          Effect.map(
            base.getFor(params),
            stubbed(
              params.orgId === undefined || params.projectId === undefined
                ? unscoped
                : overlayFor({ orgId: params.orgId, projectId: params.projectId })
            )
          ),
      });
    })
  );
  return { requests: transport.requests, scopes: transport.scopes, layer };
};

/** A request the stub answers specially: its method and a prefix of its path. */
export interface StubRoute {
  readonly method: string;
  readonly path: string;
  readonly respond: () => Response;
}

/**
 * A `respond` that answers a request with the first route whose method and
 * path prefix match it, and every other request with `otherwise`.
 */
export const routeRequests =
  (routes: ReadonlyArray<StubRoute>, otherwise: () => Response) =>
  (request: StubRequest): Response => {
    const route = routes.find(
      ({ method, path }) => request.method === method && request.path.startsWith(path)
    );
    return (route?.respond ?? otherwise)();
  };
