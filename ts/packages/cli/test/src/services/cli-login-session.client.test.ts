import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { afterEach, describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Fiber, Layer, Option } from 'effect';
import { Base64Url } from 'effect/encoding';
import { HttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';
import { createHash } from 'node:crypto';
import * as tempy from 'tempy';
import { vi } from 'vitest';
import { handlePollLogin } from 'src/commands/login/login.handler';
import { browserLogin } from 'src/effects/browser-login';
import { ComposioClientSingleton, ComposioSessionRepository } from 'src/services/composio-clients';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { ProjectContext } from 'src/services/project-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { MockConsole, ToolkitsTest } from 'test/__utils__';
import { PendingLoginSessionTest } from 'test/__utils__/layers/pending-login-session';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

// Resolve the real client configuration without opening the OS credential store.
vi.mock('@composio/cli-keyring/effect', async importOriginal => {
  const actual = await importOriginal<typeof import('@composio/cli-keyring/effect')>();
  const { Effect, Layer } = await import('effect');
  const { KeyringError } = await import('@composio/cli-keyring');
  return {
    ...actual,
    KeyringLiveWithBackend: () =>
      Layer.succeed(actual.KeyringService, {
        getPassword: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        getSecret: () => Effect.fail(new KeyringError({ kind: 'NoEntry' })),
        setPassword: () => Effect.die(new Error('Unexpected credential write')),
        setSecret: () => Effect.die(new Error('Unexpected credential write')),
        deleteCredential: () => Effect.die(new Error('Unexpected credential deletion')),
        isAvailable: Effect.succeed(true),
      }),
  };
});

const BASE_URL = 'https://backend.composio.dev';
const SESSION_ID = '5e551011-0000-4000-8000-000000000001';
const EXPIRES_AT = '1970-01-01T00:10:00.000Z';
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

/** One request as it left the CLI for the API. */
interface SentRequest {
  readonly method: string;
  /** Path and query string, without the origin. */
  readonly pathAndQuery: string;
  readonly headers: Headers;
  /** The headers as a log line written while the request is in flight would show them. */
  readonly rendered: string;
  readonly body: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-should-retry': 'false' },
  });

const pendingSession = {
  id: SESSION_ID,
  code: 'A1B2C3',
  expiresAt: EXPIRES_AT,
  status: 'pending',
  api_key: null,
};

/**
 * Answers `create-session` with an acknowledged session, the first two `get-session` calls with
 * `pending`, and the third with the 401 a rejected proof gets.
 */
const stubApi = () => {
  const sent: Array<SentRequest> = [];
  let polls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    sent.push({
      method: init?.method ?? 'GET',
      pathAndQuery: `${url.pathname}${url.search}`,
      headers: new Headers(init?.headers),
      rendered: JSON.stringify(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    if (url.pathname === '/api/v3.1/cli/create-session') {
      return json({ ...pendingSession, code_challenge_method: 'S256' }, 201);
    }
    if (url.pathname === '/api/v3.1/cli/get-session') {
      polls += 1;
      return polls < 3
        ? json(pendingSession)
        : json(
            {
              error: {
                message: 'Invalid session proof',
                code: 2105,
                slug: 'CLI_SessionProofInvalid',
                status: 401,
              },
            },
            401
          );
    }
    return json(
      { error: { message: 'unexpected', code: 404, slug: 'Not_Found', status: 404 } },
      404
    );
  });
  return sent;
};

/** The real session repository and client over `globalThis.fetch`, with in-memory login state. */
const wireTest = () => {
  const home = tempy.temporaryDirectory({ prefix: 'cli-login-session' });
  const pending = PendingLoginSessionTest();
  const platform = Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(NodeOs, NodeOs.of(defaultNodeOs({ homedir: home }))),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { COMPOSIO_BASE_URL: BASE_URL } }))
  );
  const layer = Layer.mergeAll(
    Layer.provide(ComposioSessionRepository.Default, platform),
    platform,
    BunCrypto.layer,
    Layer.effect(MockConsole.MockConsole, MockConsole.make),
    Layer.succeed(TerminalUI, terminalUITestImpl),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey: Option.none(),
          baseURL: BASE_URL,
          webURL: 'https://dashboard.composio.dev/',
          orgId: Option.none(),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => false,
        logout: Effect.void,
        login: () => Effect.die(new Error('unexpected credential store')),
        update: () => Effect.void,
      })
    ),
    // Only the session calls may reach the network in this suite.
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.die(new Error('unexpected account client')),
        getFor: () => Effect.die(new Error('unexpected account client')),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    ),
    pending.layer,
    ToolkitsTest(),
    Layer.succeed(ProjectContext, ProjectContext.of({ resolve: Effect.succeed(Option.none()) })),
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(request => Effect.die(new Error(`unexpected HTTP call: ${request.url}`)))
    ),
    Layer.succeed(
      NodeProcess,
      NodeProcess.of({
        cwd: home,
        execPath: `${home}/composio`,
        platform: 'darwin',
        arch: 'arm64',
      })
    )
  );
  return { layer, pending };
};

const s256 = (verifier: string) =>
  Base64Url.encode(new Uint8Array(createHash('sha256').update(verifier).digest()));

describe('CLI login session on the wire', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect(
    '[Given] a headless login completed with --poll [Then] the verifier travels only in the x-cli-session-secret header of every get-session call',
    () => {
      const { layer, pending } = wireTest();
      return Effect.gen(function* () {
        const sent = stubApi();

        yield* browserLogin({ scope: 'user', noBrowser: true, noWait: true });

        const cached = Option.getOrThrow(pending.current());
        const verifier = cached.verifier ?? '';
        expect(verifier).toMatch(BASE64URL_43);

        const [create] = sent;
        expect(create).toMatchObject({
          method: 'POST',
          pathAndQuery: '/api/v3.1/cli/create-session',
        });
        const createBody = JSON.parse(create.body) as Record<string, unknown>;
        expect(createBody).toMatchObject({
          scope: 'user',
          code_challenge: s256(verifier),
          code_challenge_method: 'S256',
        });
        expect(createBody.code_challenge).toMatch(BASE64URL_43);
        expect(createBody.source).toMatch(/^composio-cli \S+ \(\w+\/\w+\)$/);

        const poll = yield* Effect.forkChild(
          Effect.flip(handlePollLogin({ noSkillInstall: true }))
        );
        yield* Effect.yieldNow.pipe(
          Effect.andThen(TestClock.adjust('5 seconds')),
          Effect.repeat({ until: () => poll.pollUnsafe() !== undefined, times: 100 })
        );
        const error = yield* Fiber.join(poll);

        expect(error).toMatchObject({
          _tag: 'commands/LoginSessionEndedError',
          reason: 'proof-rejected',
        });
        const polls = sent.filter(request =>
          request.pathAndQuery.startsWith('/api/v3.1/cli/get-session')
        );
        // Two pending answers, then the rejection ends the wait without another call.
        expect(polls.map(request => request.pathAndQuery)).toEqual([
          `/api/v3.1/cli/get-session?id=${SESSION_ID}`,
          `/api/v3.1/cli/get-session?id=${SESSION_ID}`,
          `/api/v3.1/cli/get-session?id=${SESSION_ID}`,
        ]);
        expect(polls.map(request => request.headers.get('x-cli-session-secret'))).toEqual([
          verifier,
          verifier,
          verifier,
        ]);
        expect(polls.filter(request => request.rendered.includes(verifier))).toEqual([]);
        expect(sent.filter(request => request.pathAndQuery.includes(verifier))).toEqual([]);
        const lines = yield* MockConsole.getLines();
        expect(lines.join('\n')).not.toContain(verifier);
        expect(Option.isNone(pending.current())).toBe(true);
      }).pipe(Effect.provide(layer));
    }
  );
});
