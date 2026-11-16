import { describe, expect, test } from 'bun:test';
import { ConfigProvider, Console, Effect } from 'effect';
import { NpmCli, publishNpm, type Distribution } from '../scripts/sdk-release/registry';
import { CommandError, sha256Hex } from '../scripts/sdk-release/runtime';
import { batch } from './sdk-release-controller-fixture';
import { runRelease, type Fetch } from './sdk-release-harness';

const ID_TOKEN_REQUEST_URL = 'https://token.actions.example.test/oidc?api-version=2.0';
const ID_TOKEN_REQUEST_TOKEN = 'actions-request-secret';
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJyZXBvc2l0b3J5IjoiQ29tcG9zaW9IUS9jb21wb3NpbyJ9.c2ln';
const NPM_TOKEN = `npm_${'x'.repeat(36)}`;
const EXCHANGE = 'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/';
const REFUSAL = 'OIDC token exchange error - package not found';

const tarball = async (name: string, file: string): Promise<Distribution> => {
  const bytes = new TextEncoder().encode(`original ${file}`);
  return {
    language: 'typescript',
    name,
    version: '1.0.1',
    file,
    bytes,
    sha256: await runRelease(sha256Hex(bytes)),
  };
};
const core = await tarball('@composio/core', 'composio-core-1.0.1.tgz');
const openai = await tarball('@composio/openai', 'composio-openai-1.0.1.tgz');

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | null;
}

/** GitHub's ID-token endpoint, npm's exchange endpoint, and a registry that serves neither tarball yet. */
const fakeRegistry = (refused: ReadonlySet<string>) => {
  const sent: Sent[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    sent.push({ method, url, authorization: new Headers(init?.headers).get('authorization') });
    if (url.startsWith('https://token.actions.example.test/'))
      return new Response(JSON.stringify({ value: ID_TOKEN }));
    if (url.startsWith(EXCHANGE))
      return refused.has(decodeURIComponent(url.slice(EXCHANGE.length)))
        ? new Response(JSON.stringify({ message: REFUSAL }), { status: 404 })
        : new Response(JSON.stringify({ token: NPM_TOKEN }));
    if (url.endsWith('/latest')) return new Response(JSON.stringify({ version: '1.0.0' }));
    if (url.startsWith('https://registry.npmjs.org/')) return new Response('{}', { status: 404 });
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  return { sent, fetch };
};

const withActionsEnv = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(env));

const actionsEnv = {
  ACTIONS_ID_TOKEN_REQUEST_URL: ID_TOKEN_REQUEST_URL,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: ID_TOKEN_REQUEST_TOKEN,
};

/** Runs `publishNpm` against fakes and returns what it printed, the npm commands, and the failure. */
const publish = async (files: Distribution[], fetch: Fetch, env: Record<string, string>) => {
  const printed: string[] = [];
  const commands: string[][] = [];
  const capture = (...args: ReadonlyArray<unknown>) => printed.push(args.map(String).join(' '));
  const console: Console.Console = Object.assign(Object.create(globalThis.console), {
    log: capture,
    info: capture,
    warn: capture,
    error: capture,
  });
  const failure = await runRelease(
    publishNpm('.', batch, files).pipe(
      withActionsEnv(env),
      Effect.provideService(NpmCli, {
        run: args => {
          commands.push([...args]);
          // Stops the run right after the first upload; later steps have their own tests.
          return Effect.fail(new CommandError({ message: 'stopped after publish', exitCode: 1 }));
        },
      }),
      Effect.provideService(Console.Console, console),
      Effect.flip
    ),
    fetch
  );
  const message = failure instanceof Error ? failure.message : String(failure);
  return { output: [...printed, message].join('\n'), message, commands };
};

const expectNoTokens = (output: string) => {
  expect(output).not.toContain('eyJ');
  expect(output).not.toContain('npm_');
  expect(output).not.toContain(ID_TOKEN_REQUEST_TOKEN);
};

describe('npm trusted-publishing login preflight', () => {
  test('a refused exchange for one package fails before any upload and names that package and npm’s reason', async () => {
    const registry = fakeRegistry(new Set(['@composio/openai']));
    const result = await publish([core, openai], registry.fetch, actionsEnv);
    expect(result.commands).toEqual([]);
    expect(result.message).toContain(`@composio/openai (404): ${REFUSAL}`);
    expect(result.message).not.toContain('@composio/core (');
    expect(result.output).toContain('@composio/core');
    expectNoTokens(result.output);
  });

  test('accepted exchanges let publishing proceed without printing either token', async () => {
    const registry = fakeRegistry(new Set());
    const result = await publish([core, openai], registry.fetch, actionsEnv);
    expect(result.commands[0]?.slice(0, 1)).toEqual(['publish']);
    expect(result.message).toContain('stopped after publish');
    expectNoTokens(result.output);
    expect(registry.sent.slice(0, 3)).toEqual([
      {
        method: 'GET',
        url: `${ID_TOKEN_REQUEST_URL}&audience=npm%3Aregistry.npmjs.org`,
        authorization: `Bearer ${ID_TOKEN_REQUEST_TOKEN}`,
      },
      { method: 'POST', url: `${EXCHANGE}@composio%2fcore`, authorization: `Bearer ${ID_TOKEN}` },
      { method: 'POST', url: `${EXCHANGE}@composio%2fopenai`, authorization: `Bearer ${ID_TOKEN}` },
    ]);
  });

  test('without the GitHub ID-token request env the preflight names the missing id-token permission', async () => {
    const registry = fakeRegistry(new Set());
    const result = await publish([core], registry.fetch, {});
    expect(result.message).toContain('id-token permission missing');
    expect(result.commands).toEqual([]);
    expect(registry.sent).toEqual([]);
  });
});
