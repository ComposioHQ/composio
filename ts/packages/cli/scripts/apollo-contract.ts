#!/usr/bin/env bun
/**
 * Checks that a deployed Apollo still returns responses the CLI's client
 * accepts. Each case is a read the CLI makes, sent through the same client
 * and validated against the same generated schemas the CLI ships with.
 *
 *   COMPOSIO_BASE_URL=https://staging-backend.composio.dev \
 *   COMPOSIO_API_KEY=ak_... COMPOSIO_USER_API_KEY=uak_... \
 *   bun scripts/apollo-contract.ts
 *
 * Only reads run, against an allowlisted origin, with no retries. The run
 * stops at the first 401, 403 or 429 rather than repeating a bad credential
 * or adding load. A missing key fails the run instead of skipping its cases.
 */
import { appendFileSync } from 'node:fs';
import { Cause, Effect, Exit } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import {
  // eslint-disable-next-line no-restricted-imports -- a standalone script needs its own client
  make as makeComposioClient,
  Auth,
  type ComposioClientShape,
  type ComposioError,
} from '@composio/client/effect';
import { schemaLoaders } from '@composio/client/effect/schemas';

const ALLOWED_ORIGINS = new Set([
  'https://staging-backend.composio.dev',
  'https://backend.composio.dev',
]);
const REQUEST_TIMEOUT_MS = 10_000;
const validated = { decode: true } as const;

type Credential = 'project' | 'user';

interface ContractCase {
  readonly name: string;
  readonly credential: Credential;
  readonly run: (client: ComposioClientShape) => Effect.Effect<unknown, ComposioError>;
}

const CASES: ReadonlyArray<ContractCase> = [
  {
    name: 'toolkits.list',
    credential: 'project',
    run: client => client.toolkits.list({ limit: 5 }, validated),
  },
  {
    name: 'toolkits.retrieve hackernews',
    credential: 'project',
    run: client => client.toolkits.retrieve('hackernews', null, validated),
  },
  {
    name: 'toolkits.retrieveCategories',
    credential: 'project',
    run: client => client.toolkits.retrieveCategories(validated),
  },
  {
    name: 'tools.list hackernews',
    credential: 'project',
    run: client => client.tools.list({ toolkit_slug: 'hackernews', limit: 5 }, validated),
  },
  {
    name: 'tools.retrieve HACKERNEWS_GET_USER',
    credential: 'project',
    run: client => client.tools.retrieve('HACKERNEWS_GET_USER', null, validated),
  },
  {
    name: 'triggersTypes.list',
    credential: 'project',
    run: client => client.triggersTypes.list({ limit: 5 }, validated),
  },
  {
    name: 'authConfigs.list',
    credential: 'project',
    run: client => client.authConfigs.list({ limit: 5 }, validated),
  },
  {
    name: 'connectedAccounts.list',
    credential: 'project',
    run: client => client.connectedAccounts.list({ limit: 5 }, validated),
  },
  {
    name: 'org.list',
    credential: 'user',
    run: client => client.org.list({ limit: 50 }, validated),
  },
  {
    name: 'org.project.list (first org)',
    credential: 'user',
    run: client =>
      client.org.list({ limit: 1 }, validated).pipe(
        Effect.flatMap(({ organizations }) => {
          const [first] = organizations;
          return first === undefined
            ? Effect.die(new Error('the user key belongs to no organization'))
            : client.org.project.list(
                { limit: 50 },
                { ...validated, headers: { 'x-org-id': first.id } }
              );
        })
      ),
  },
];

type Outcome =
  | { readonly status: 'pass' }
  | { readonly status: 'fail'; readonly detail: string; readonly stop: boolean }
  | { readonly status: 'not run'; readonly detail: string };

const STOP_STATUSES = new Set([401, 403, 429]);

/** One line naming why a case failed: the schema paths, or the HTTP status. */
const describeFailure = (cause: Cause.Cause<ComposioError>): { detail: string; stop: boolean } => {
  const error = Cause.squash(cause) as Partial<ComposioError> & { _tag?: string };
  if (error._tag === '@composio/client/DecodeError' && 'issues' in error) {
    const issues = (error.issues ?? [])
      .slice(0, 5)
      .map(i => `${i.path.join('.') || '(root)'}: ${i.kind}`);
    return { detail: `schema mismatch: ${issues.join('; ')}`, stop: false };
  }
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const message =
    'message' in error && typeof error.message === 'string' ? error.message : String(error);
  return {
    detail: status === undefined ? message : `HTTP ${status}: ${message}`,
    stop: status !== undefined && STOP_STATUSES.has(status),
  };
};

const program = Effect.gen(function* () {
  const baseURL = process.env.COMPOSIO_BASE_URL ?? '';
  if (!ALLOWED_ORIGINS.has(baseURL)) {
    return yield* Effect.die(
      new Error(
        `COMPOSIO_BASE_URL must be one of ${[...ALLOWED_ORIGINS].join(', ')}; got "${baseURL}"`
      )
    );
  }
  const keys: Record<Credential, string | undefined> = {
    project: process.env.COMPOSIO_API_KEY || undefined,
    user: process.env.COMPOSIO_USER_API_KEY || undefined,
  };

  const httpClient = yield* HttpClient.HttpClient;
  const clientFor = (credential: Credential, key: string) =>
    makeComposioClient(
      {
        auth: credential === 'project' ? Auth.project(key) : Auth.user(key),
        baseURL,
        maxRetries: 0,
        timeout: REQUEST_TIMEOUT_MS,
        schemas: schemaLoaders,
      },
      httpClient
    );
  const clients = {
    project: keys.project === undefined ? undefined : clientFor('project', keys.project),
    user: keys.user === undefined ? undefined : clientFor('user', keys.user),
  };

  const results: Array<{ readonly name: string; readonly outcome: Outcome }> = [];
  let stopReason: string | undefined;
  for (const contractCase of CASES) {
    const client = clients[contractCase.credential];
    if (stopReason !== undefined) {
      results.push({ name: contractCase.name, outcome: { status: 'not run', detail: stopReason } });
      continue;
    }
    if (client === undefined) {
      const variable =
        contractCase.credential === 'project' ? 'COMPOSIO_API_KEY' : 'COMPOSIO_USER_API_KEY';
      results.push({
        name: contractCase.name,
        outcome: { status: 'not run', detail: `${variable} is not set` },
      });
      continue;
    }
    const exit = yield* Effect.exit(contractCase.run(client));
    if (Exit.isSuccess(exit)) {
      results.push({ name: contractCase.name, outcome: { status: 'pass' } });
      continue;
    }
    const { detail, stop } = describeFailure(exit.cause);
    results.push({ name: contractCase.name, outcome: { status: 'fail', detail, stop } });
    if (stop)
      stopReason = `stopped after "${contractCase.name}" failed with ${detail.split(':')[0]}`;
  }
  return { baseURL, results };
});

const escapeCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const { baseURL, results } = await Effect.runPromise(
  program.pipe(Effect.provide(FetchHttpClient.layer))
);
const passed = results.filter(r => r.outcome.status === 'pass').length;
const report = [
  `### Apollo contract: ${baseURL}`,
  '',
  `${passed}/${results.length} cases passed against \`@composio/client\` response schemas.`,
  '',
  '| Case | Result | Detail |',
  '| --- | --- | --- |',
  ...results.map(
    ({ name, outcome }) =>
      `| ${name} | ${outcome.status} | ${outcome.status === 'pass' ? '' : escapeCell(outcome.detail)} |`
  ),
  '',
].join('\n');

// eslint-disable-next-line no-console -- the report is this script's output
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exitCode = passed === results.length ? 0 : 1;
