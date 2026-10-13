import { make, type ComposioClientShape } from '@composio/client/effect';
import { Effect, Result } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { composioSchemaLoaders } from 'src/services/composio-schema-loaders';

/** One request as it reached the stub transport. */
export interface StubRequest {
  readonly method: string;
  /** Path and query, without the origin. */
  readonly path: string;
  /** The JSON body, or `undefined` when the request carried none. */
  readonly body: unknown;
}

/**
 * The Effect client the CLI builds in production (response decoding on, the
 * CLI's loader table), over a transport that records each request and answers
 * it with `respond`. Retries, status errors, and decoding are the client's own.
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
      apiKey: 'test',
      userApiKey: null,
      orgApiKey: null,
      baseURL: 'https://stub.invalid',
      deprecationNotices: 'off',
      decode: true,
      schemas: composioSchemaLoaders,
    },
    httpClient
  );
  return { client, requests };
};
