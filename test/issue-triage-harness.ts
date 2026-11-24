import { Duration, Effect, Layer, Option, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/http';
import type { JevAnswers } from '../scripts/issue-triage/jev.ts';
import { Plain } from '../scripts/issue-triage/plain.ts';

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const baseAnswers: JevAnswers = {
  account_specific: 0.05,
  hosted_problem: 0.05,
  sdk_code: 0.1,
  new_toolkit: 0.05,
  is_bug: 0.05,
  missing_details: 0.05,
  feature_request: 0.05,
  sdk_area: { ts: 0.05, py: 0.05, cli: 0.05, docs: 0.05, none: 0.8 },
};
export const answers = (overrides: Partial<JevAnswers>): JevAnswers => ({ ...baseAnswers, ...overrides });

export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

/** Runs an effect with fetch replaced, returning its exit so tests can inspect typed failures. */
export const runWith = <A, E>(effect: Effect.Effect<A, E>, fetch: Fetch) =>
  Effect.runPromise(Effect.exit(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch as typeof globalThis.fetch))));

/** A Plain service over fetch, with a test API key. */
export const plainLayer = (key = 'plain-secret-sentinel', timeout: Duration.Input = '1 second') =>
  Layer.effect(Plain, Plain.make(Option.some(Redacted.make(key)), timeout)).pipe(Layer.provide(FetchHttpClient.layer));

export interface PlainRequest {
  readonly operation: string;
  readonly variables: Record<string, unknown>;
  readonly raw: string;
  readonly authorization: string | null;
}

/** Reads the GraphQL operation a Plain request names, for fakes that answer per operation. */
export const readPlainRequest = async (input: Parameters<Fetch>[0], init?: RequestInit): Promise<PlainRequest> => {
  const request = new Request(input, init);
  const raw = await request.text();
  const { query, variables } = JSON.parse(raw) as { query: string; variables: Record<string, unknown> };
  return {
    operation: String(query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1]),
    variables,
    raw,
    authorization: request.headers.get('authorization'),
  };
};

/** A Plain backend that keeps one thread per issue; `down` answers every request with a 500. */
export const fakePlain = () => {
  const state = { operations: [] as string[], requests: [] as PlainRequest[], thread: false, down: false };
  const fetch: Fetch = async (input, init) => {
    const request = await readPlainRequest(input, init);
    state.operations.push(request.operation);
    state.requests.push(request);
    if (state.down) return json({ errors: [{ extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }, 500);
    if (request.operation === 'supportThread')
      return json({ data: { threadsByExternalId: { edges: state.thread ? [{ node: { id: 't_1' } }] : [] } } });
    if (request.operation === 'upsertCustomer') return json({ data: { upsertCustomer: { customer: { id: 'c_1' } } } });
    state.thread = true;
    return json({ data: { createThread: { thread: { id: 't_1', ref: 'T-1' } } } });
  };
  return { state, fetch };
};
