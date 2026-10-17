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
 * The Effect client the CLI builds in production, over a transport that
 * records each request and answers it with `respond`. Retries, status errors,
 * and the validation a call asks for are the client's own.
 *
 * A retried call sleeps on Effect's clock, so a test whose answer is retryable
 * runs under `it.live` and answers with a `retry-after-ms: 0` header.
 */
export const stubComposioClient = (
  respond: (request: StubRequest) => Response
): { readonly client: ComposioClientShape; readonly requests: ReadonlyArray<StubRequest> } => {
  const requests: Array<StubRequest> = [];
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
      requests.push(recorded);
      return HttpClientResponse.fromWeb(request, respond(recorded));
    })
  );
  const client = make(
    {
      auth: Auth.project('test'),
      baseURL: 'https://stub.invalid',
      maxRetries: 0,
      schemas: schemaLoaders,
    },
    httpClient
  );
  return { client, requests };
};

/**
 * A layer over a test layer's `ComposioClientSingleton` that swaps the named
 * resources of every client it hands out for those of a client built by
 * {@link stubComposioClient}. Calls to those resources go through the real
 * client to `respond`; every other resource keeps the test layer's answers.
 *
 * The test layer's answers do not model request options (`signal`,
 * `maxRetries`, or any header beyond `decode`) and `connectedAccounts.list`
 * never returns a `next_cursor`, so pagination, retries, and abort are
 * exercised through {@link stubComposioClient}, the real `make` over a
 * recording transport.
 */
export const stubClientResources = (
  resources: ReadonlyArray<keyof ComposioClientShape>,
  respond: (request: StubRequest) => Response
) => {
  const stub = stubComposioClient(respond);
  const overlay = Object.fromEntries(resources.map(resource => [resource, stub.client[resource]]));
  const stubbed = (client: ComposioClientShape): ComposioClientShape => ({ ...client, ...overlay });
  const layer = Layer.effect(
    ComposioClientSingleton,
    Effect.gen(function* () {
      const base = yield* ComposioClientSingleton;
      return ComposioClientSingleton.of({
        ...base,
        get: () => Effect.map(base.get(), stubbed),
        getFor: params => Effect.map(base.getFor(params), stubbed),
      });
    })
  );
  return { requests: stub.requests, layer };
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
