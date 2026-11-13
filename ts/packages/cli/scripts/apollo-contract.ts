#!/usr/bin/env bun
/**
 * Checks ten read-only Apollo responses against the CLI's generated client schemas.
 *
 *   COMPOSIO_BASE_URL=https://staging-backend.composio.dev \
 *   COMPOSIO_API_KEY=ak_... COMPOSIO_USER_API_KEY=uak_... \
 *   bun scripts/apollo-contract.ts
 *
 * The project key covers toolkit, tool, trigger, auth-config and account reads.
 * The user key covers organization/project discovery used during CLI login.
 * Both keys are required. Requests run sequentially, without retries, and stop
 * at the first 401, 403 or 429.
 */
import { appendFileSync } from 'node:fs';
import { Config, Data, Effect, Match, Redacted } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import {
  // eslint-disable-next-line no-restricted-imports -- a standalone script needs its own client
  make as makeComposioClient,
  Auth,
  isAPIError,
  type ComposioError,
} from '@composio/client/effect';
import { schemaLoaders } from '@composio/client/effect/schemas';

const ALLOWED_ORIGINS = [
  'https://staging-backend.composio.dev',
  'https://backend.composio.dev',
] as const;
const validated = { decode: true } as const;

class ContractSetupError extends Data.TaggedError('ContractSetupError')<{
  readonly message: string;
}> {}

type Outcome = {
  readonly status: 'pass' | 'fail' | 'not run';
  readonly detail: string;
  readonly stop?: boolean;
};

const describeFailure = (error: ComposioError | ContractSetupError): Outcome =>
  Match.value(error).pipe(
    Match.tag('@composio/client/DecodeError', error => ({
      status: 'fail' as const,
      detail: `schema mismatch: ${error.issues
        .slice(0, 5)
        .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.kind}`)
        .join('; ')}`,
    })),
    Match.tag('ContractSetupError', error => ({ status: 'fail' as const, detail: error.message })),
    Match.orElse(error => ({
      status: 'fail' as const,
      detail: isAPIError(error) ? `HTTP ${error.status}: ${error.message}` : error.message,
      stop: isAPIError(error) && [401, 403, 429].includes(error.status),
    }))
  );

export const checkApolloContract = Effect.gen(function* () {
  const baseURL = yield* Config.Literals(ALLOWED_ORIGINS, 'COMPOSIO_BASE_URL');
  const projectKey = yield* Config.NonEmptyString('COMPOSIO_API_KEY').pipe(
    Config.map(Redacted.make)
  );
  const userKey = yield* Config.NonEmptyString('COMPOSIO_USER_API_KEY').pipe(
    Config.map(Redacted.make)
  );
  const httpClient = yield* HttpClient.HttpClient;
  const clientFor = (auth: Auth) =>
    makeComposioClient(
      { auth, baseURL, maxRetries: 0, timeout: 10_000, schemas: schemaLoaders },
      httpClient
    );
  const project = clientFor(Auth.project(projectKey));
  const user = clientFor(Auth.user(userKey));
  const cases: Record<string, Effect.Effect<unknown, ComposioError | ContractSetupError>> = {
    'toolkits.list': project.toolkits.list({ limit: 5 }, validated),
    'toolkits.retrieve hackernews': project.toolkits.retrieve('hackernews', null, validated),
    'toolkits.retrieveCategories': project.toolkits.retrieveCategories(validated),
    'tools.list hackernews': project.tools.list(
      { toolkit_slug: 'hackernews', limit: 5 },
      validated
    ),
    'tools.retrieve HACKERNEWS_GET_USER': project.tools.retrieve(
      'HACKERNEWS_GET_USER',
      null,
      validated
    ),
    'triggersTypes.list': project.triggersTypes.list({ limit: 5 }, validated),
    'authConfigs.list': project.authConfigs.list({ limit: 5 }, validated),
    'connectedAccounts.list': project.connectedAccounts.list({ limit: 5 }, validated),
    'org.list': user.org.list({ limit: 50 }, validated),
    'org.project.list (first org)': Effect.gen(function* () {
      const { organizations } = yield* user.org.list({ limit: 1 }, validated);
      const [first] = organizations;
      if (first === undefined) {
        return yield* new ContractSetupError({
          message: 'the user key belongs to no organization',
        });
      }
      return yield* user.org.project.list(
        { limit: 50 },
        { ...validated, headers: { 'x-org-id': first.id } }
      );
    }),
  };

  let stopReason: string | undefined;
  const results = yield* Effect.forEach(
    Object.entries(cases),
    ([name, request]) =>
      Effect.gen(function* () {
        const outcome: Outcome = stopReason
          ? { status: 'not run', detail: stopReason }
          : yield* request.pipe(
              Effect.match({
                onSuccess: (): Outcome => ({ status: 'pass', detail: '' }),
                onFailure: describeFailure,
              })
            );
        if (outcome.stop)
          stopReason = `stopped after "${name}" failed with ${outcome.detail.split(':')[0]}`;
        return { name, outcome };
      }),
    { concurrency: 1 }
  );
  return { baseURL, results };
});

/** Encode punctuation so response text cannot become Markdown or HTML. */
const escapeCell = (text: string) =>
  text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[&<>!"'`*_[\]{}()#+.\\|~:-]/g, char => `&#${char.charCodeAt(0)};`);

export const renderReport = ({ baseURL, results }: Effect.Success<typeof checkApolloContract>) => {
  const passed = results.filter(result => result.outcome.status === 'pass').length;
  return [
    `### Apollo contract: ${baseURL}`,
    '',
    `${passed}/${results.length} cases passed against \`@composio/client\` response schemas.`,
    '',
    '| Case | Result | Detail |',
    '| --- | --- | --- |',
    ...results.map(
      ({ name, outcome }) => `| ${name} | ${outcome.status} | ${escapeCell(outcome.detail)} |`
    ),
    '',
  ].join('\n');
};

if (import.meta.main) {
  const result = await Effect.runPromise(
    checkApolloContract.pipe(Effect.provide(FetchHttpClient.layer))
  );
  const report = renderReport(result);
  // eslint-disable-next-line no-console -- the report is this script's output
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  process.exitCode = result.results.every(result => result.outcome.status === 'pass') ? 0 : 1;
}
