import { Config, Context, Duration, Effect, Layer, Option, Redacted, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { PositiveInt } from '../lib/github.ts';
import {
  InvalidResponse,
  MissingApiKey,
  TimedOut,
  Unreachable,
  apiKey,
  decodeJson,
  describeFailure,
  postJson,
} from './http.ts';

const PLAIN_URL = 'https://core-api.uk.plain.com/graphql/v1';
const BODY_LIMIT = 8000;

/** GraphQL error codes safe to report; Plain's messages can echo credentials or customer data. */
const ReportableCode = Schema.Literals([
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'BAD_USER_INPUT',
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'INTERNAL_SERVER_ERROR',
]);
const isReportable = Schema.is(ReportableCode);

/** Plain refused the operation: a non-2xx status or GraphQL errors. */
export class Rejected extends Schema.TaggedError<Rejected>()('Rejected', {
  status: Schema.Int,
  codes: Schema.Array(ReportableCode),
}) {}

/** Plain answered without the customer or thread the mutation should have produced. */
export class NotCreated extends Schema.TaggedError<NotCreated>()('NotCreated', {
  entity: Schema.Literals(['customer', 'thread']),
  errorType: Schema.optionalKey(Schema.String),
}) {}

/** Plain customers are keyed by the numeric GitHub user ID, which the issue does not carry. */
export class MissingAuthorId extends Schema.TaggedError<MissingAuthorId>()('MissingAuthorId', {}) {}

export class PlainError extends Schema.TaggedError<PlainError>()('PlainError', {
  operation: Schema.Literals(['supportThread', 'upsertCustomer', 'createThread']),
  reason: Schema.Union([MissingApiKey, TimedOut, Unreachable, InvalidResponse, Rejected, NotCreated, MissingAuthorId]),
}) {
  override get message() {
    const { reason } = this;
    const detail =
      reason._tag === 'Rejected'
        ? `HTTP ${reason.status}; ${reason.codes.length > 0 ? reason.codes.join(', ') : 'unrecognized GraphQL error'}`
        : reason._tag === 'NotCreated'
          ? `no ${reason.entity} created (${reason.errorType ?? 'no error type'})`
          : reason._tag === 'MissingAuthorId'
            ? 'GitHub author ID is unavailable; cannot identify the Plain customer'
            : describeFailure(reason);
    return `Plain API request failed during ${this.operation} (${detail}).`;
  }
}

export type PlainOperation = PlainError['operation'];

export const PlainIssue = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  number: PositiveInt,
  title: Schema.String,
  body: Schema.String,
  htmlUrl: Schema.String,
  // Identity comes only from the numeric GitHub user ID; public profile fields (email, name) are never used.
  author: Schema.Struct({ login: Schema.String, id: Schema.optionalKey(Schema.Number) }),
});
export type PlainIssue = typeof PlainIssue.Type;

const Thread = Schema.Struct({ id: Schema.NonEmptyString, ref: Schema.optionalKey(Schema.NullOr(Schema.String)) });
export type PlainThread = typeof Thread.Type;
const MutationError = Schema.optionalKey(Schema.NullOr(Schema.Struct({ type: Schema.optionalKey(Schema.String) })));

const ThreadLookup = Schema.Struct({
  threadsByExternalId: Schema.Struct({ edges: Schema.Array(Schema.Struct({ node: Thread })) }),
});
const CustomerUpsert = Schema.Struct({
  upsertCustomer: Schema.Struct({
    customer: Schema.optionalKey(Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString }))),
    error: MutationError,
  }),
});
const ThreadCreation = Schema.Struct({
  createThread: Schema.Struct({ thread: Schema.optionalKey(Schema.NullOr(Thread)), error: MutationError }),
});

// Read loosely: a GraphQL error response can null out any field, and its codes must survive that.
const Envelope = Schema.Struct({ data: Schema.optionalKey(Schema.Unknown), errors: Schema.optionalKey(Schema.Unknown) });
const ErrorCodes = Schema.Array(
  Schema.Struct({
    extensions: Schema.optionalKey(Schema.NullOr(Schema.Struct({ code: Schema.optionalKey(Schema.Unknown) }))),
  })
);
const reportableCodes = (errors: unknown) =>
  Option.match(Schema.decodeUnknownOption(ErrorCodes)(errors), {
    onNone: () => [],
    onSome: list => [...new Set(list.flatMap(error => error.extensions?.code ?? []).filter(isReportable))],
  });

const QUERIES: Record<PlainOperation, string> = {
  supportThread:
    'query supportThread($externalId: ID!) { threadsByExternalId(externalId: $externalId, first: 1) { edges { node { id ref } } } }',
  upsertCustomer:
    'mutation upsertCustomer($input: UpsertCustomerInput!) { upsertCustomer(input: $input) { result customer { id } error { message type code } } }',
  createThread:
    'mutation createThread($input: CreateThreadInput!) { createThread(input: $input) { thread { id ref } error { message type code } } }',
};

const threadText = (issue: PlainIssue) => {
  const body = issue.body || '_No issue body provided._';
  return [
    `GitHub issue routed as support: ${issue.htmlUrl}`,
    `Reporter: @${issue.author.login || 'unknown'}`,
    '',
    'Issue body:',
    body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT)}\n\n[truncated]` : body,
  ].join('\n');
};

export class Plain extends Context.Service<
  Plain,
  { readonly forward: (issue: PlainIssue) => Effect.Effect<PlainThread, PlainError> }
>()('issue-triage/Plain') {
  static readonly make = (key: Option.Option<Redacted.Redacted>, timeout: Duration.Input = '30 seconds') =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const graphql = <S extends Schema.Top>(operation: PlainOperation, variables: unknown, data: S) =>
        Effect.gen(function* () {
          const answer = yield* postJson(
            PLAIN_URL,
            yield* apiKey('PLAIN_API_KEY', key),
            { query: QUERIES[operation], variables },
            timeout
          );
          const envelope = yield* decodeJson(Envelope, answer);
          if (answer.status < 200 || answer.status >= 300 || envelope.errors !== undefined)
            return yield* new Rejected({ status: answer.status, codes: reportableCodes(envelope.errors) });
          return (yield* Schema.decodeUnknownEffect(data)(envelope.data).pipe(
            Effect.mapError(() => new InvalidResponse({ status: answer.status }))
          )) as S['Type'];
        }).pipe(
          Effect.mapError(reason => new PlainError({ operation, reason })),
          Effect.provideService(HttpClient.HttpClient, client)
        );

      const forward = Effect.fnUntraced(function* (issue: PlainIssue) {
        const externalId = `github:${issue.owner}/${issue.repo}:issues/${issue.number}`;
        const existing = yield* graphql('supportThread', { externalId }, ThreadLookup);
        const [reused] = existing.threadsByExternalId.edges;
        if (reused) return reused.node;

        // Checked after the lookup so an existing thread is still reused when identity data is missing.
        const userId = yield* Schema.decodeUnknownEffect(PositiveInt)(issue.author.id).pipe(
          Effect.mapError(() => new PlainError({ operation: 'upsertCustomer', reason: new MissingAuthorId() }))
        );
        const login = issue.author.login || 'unknown';
        const customerExternalId = `github:user-id:${userId}`;
        const { upsertCustomer } = yield* graphql(
          'upsertCustomer',
          {
            input: {
              identifier: { externalId: customerExternalId },
              onCreate: {
                fullName: login,
                shortName: login,
                // Unverified, ID-only placeholder in a reserved TLD; it never matches a real dashboard customer.
                email: { email: `${userId}@github-user.invalid`, isVerified: false },
                externalId: customerExternalId,
              },
              onUpdate: {},
            },
          },
          CustomerUpsert
        );
        if (!upsertCustomer.customer)
          return yield* notCreated('upsertCustomer', 'customer', upsertCustomer.error?.type);

        const { createThread } = yield* graphql(
          'createThread',
          {
            input: {
              title: `[GitHub #${issue.number}] ${issue.title}`,
              customerIdentifier: { customerId: upsertCustomer.customer.id },
              externalId,
              components: [{ componentText: { text: threadText(issue) } }],
            },
          },
          ThreadCreation
        );
        if (!createThread.thread) return yield* notCreated('createThread', 'thread', createThread.error?.type);
        return createThread.thread;
      });
      return Plain.of({ forward });
    });

  static readonly layer = Layer.effect(
    Plain,
    Effect.flatMap(Config.option(Config.Redacted('PLAIN_API_KEY')), key => Plain.make(key))
  ).pipe(Layer.provide(FetchHttpClient.layer));
}

const notCreated = (operation: PlainOperation, entity: NotCreated['entity'], errorType: string | undefined) =>
  Effect.fail(
    new PlainError({ operation, reason: new NotCreated(errorType === undefined ? { entity } : { entity, errorType }) })
  );
