import { AuthenticationError } from '@composio/client/effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path } from 'effect';
import * as tempy from 'tempy';
import { rejectedUserApiKeyHint, unauthorizedHint } from 'src/effects/rejected-user-api-key';
import { NodeOs } from 'src/services/node-os';
import { ComposioUserContext } from 'src/services/user-context';

const PRODUCTION = { base: 'https://backend.composio.dev', web: 'https://dashboard.composio.dev/' };
const STAGING = {
  base: 'https://staging-backend.composio.dev',
  web: 'https://staging-dashboard.composio.dev/',
};

/** The services the hints read: `env`, and a user context with `apiKey` on `baseURL`/`webURL`. */
const userContextLayer = (
  baseURL: string,
  webURL: string,
  env: Record<string, string> = {},
  apiKey: Option.Option<string> = Option.some('uak_stored')
) =>
  Layer.mergeAll(
    Layer.succeed(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey,
          baseURL,
          webURL,
          orgId: Option.none(),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => true,
        logout: Effect.void,
        login: () => Effect.void,
        update: () => Effect.void,
      })
    )
  );

/**
 * `userContextLayer` on `baseURL`/`webURL` plus a temporary home, where `~/.composio/agent.json`
 * lives, read through the real filesystem.
 */
const agentHomeLayer = (baseURL: string, webURL: string) => {
  const homedir = tempy.temporaryDirectory({ prefix: 'unauthorized-hint' });
  return Layer.mergeAll(
    userContextLayer(baseURL, webURL),
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(
      NodeOs,
      NodeOs.of({ homedir, tmpdir: homedir, arch: 'arm64', platform: 'darwin' })
    )
  );
};

/** Saves an agent identity whose user API key is `userApiKey` in `~/.composio/agent.json`. */
const saveAgentIdentity = (userApiKey: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const dir = path.join(os.homedir, '.composio');
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(
      path.join(dir, 'agent.json'),
      JSON.stringify({
        composio_agent_key: 'ak_saved',
        composio: { user_api_key: userApiKey, org_id: 'org_agent' },
      }),
      { mode: 0o600 }
    );
  });

/** The hint for a stored login whose resolved backend is `baseURL` with its Dashboard at `webURL`. */
const hintFor = (baseURL: string, webURL: string, env: Record<string, string> = {}) =>
  rejectedUserApiKeyHint.pipe(Effect.provide(userContextLayer(baseURL, webURL, env)));

describe('rejectedUserApiKeyHint', () => {
  it.effect.each([
    { name: 'production', base: PRODUCTION.base, web: PRODUCTION.web, prefix: '' },
    {
      name: 'staging',
      base: STAGING.base,
      web: STAGING.web,
      prefix: 'COMPOSIO_ENVIRONMENT=staging ',
    },
    {
      name: 'a custom backend with the production Dashboard',
      base: 'https://api.example.test',
      web: PRODUCTION.web,
      prefix: 'COMPOSIO_BASE_URL=https://api.example.test ',
    },
    {
      name: 'a custom backend and a custom Dashboard',
      base: 'https://api.example.test',
      web: 'https://app.example.test/',
      prefix:
        'COMPOSIO_BASE_URL=https://api.example.test COMPOSIO_WEB_URL=https://app.example.test ',
    },
    {
      name: 'staging with a custom Dashboard',
      base: STAGING.base,
      web: 'https://app.example.test',
      prefix: 'COMPOSIO_ENVIRONMENT=staging COMPOSIO_WEB_URL=https://app.example.test ',
    },
    {
      name: 'production with a custom Dashboard',
      base: PRODUCTION.base,
      web: 'https://app.example.test',
      prefix: 'COMPOSIO_WEB_URL=https://app.example.test ',
    },
    {
      name: 'URLs with shell characters',
      base: "https://api.example.test/o'brien",
      web: 'https://app.example.test/preview&team',
      prefix:
        "COMPOSIO_BASE_URL='https://api.example.test/o'\\''brien' COMPOSIO_WEB_URL='https://app.example.test/preview&team' ",
    },
  ])('[Given] a stored login on $name [Then] the login command targets it', c =>
    Effect.gen(function* () {
      expect(yield* hintFor(c.base, c.web)).toBe(
        `Log in again, then retry:\n> composio logout && ${c.prefix}composio login`
      );
    })
  );

  it.effect('[Given] a key from COMPOSIO_USER_API_KEY [Then] it says to replace that key', () =>
    Effect.gen(function* () {
      expect(yield* hintFor(STAGING.base, STAGING.web, { COMPOSIO_USER_API_KEY: 'uak_env' })).toBe(
        'Replace the key in COMPOSIO_USER_API_KEY, then retry.'
      );
    })
  );
});

const unauthorized = (slug: string) =>
  new AuthenticationError({
    message: '401 Unauthorized',
    method: 'GET',
    url: 'https://backend.composio.dev/api/v3.1/auth/session/info',
    status: 401,
    requestId: undefined,
    details: { message: 'Unauthorized', code: 401, slug, status: 401 },
    body: undefined,
  });

describe('unauthorizedHint', () => {
  it.effect('[Given] the backend rejected the user API key [Then] it says to log in again', () =>
    Effect.gen(function* () {
      const hint = yield* unauthorizedHint(unauthorized('UserApiKey_Unauthorized')).pipe(
        Effect.provide(userContextLayer(PRODUCTION.base, PRODUCTION.web))
      );
      expect(hint).toEqual(
        Option.some('Log in again, then retry:\n> composio logout && composio login')
      );
    })
  );

  it.effect.each<{
    name: string;
    env: Record<string, string>;
    apiKey: Option.Option<string>;
    hint: Option.Option<string>;
  }>([
    {
      name: 'a stored login',
      env: {},
      apiKey: Option.some('uak_stored'),
      hint: Option.some(
        'If your login expired, log in again, then retry:\n> composio logout && composio login'
      ),
    },
    {
      name: 'a key from COMPOSIO_USER_API_KEY',
      env: { COMPOSIO_USER_API_KEY: 'uak_env' },
      apiKey: Option.some('uak_env'),
      hint: Option.some(
        'If the key in COMPOSIO_USER_API_KEY is no longer valid, replace it, then retry.'
      ),
    },
    { name: 'no user API key', env: {}, apiKey: Option.none(), hint: Option.none() },
  ])('[Given] another 401 and $name [Then] the login is only the likely cause', c =>
    Effect.gen(function* () {
      const hint = yield* unauthorizedHint(unauthorized('Auth_InvalidApiKey')).pipe(
        Effect.provide(userContextLayer(PRODUCTION.base, PRODUCTION.web, c.env, c.apiKey))
      );
      expect(hint).toEqual(c.hint);
    })
  );
});

describe('[Given] the stored login is the saved agent identity', () => {
  // `composio logout` would need --yes without a terminal and would delete the saved agent key.
  it.effect('[Then] a rejected key names `composio login --agent`, with no logout', () =>
    Effect.gen(function* () {
      yield* saveAgentIdentity('uak_stored');
      expect(yield* rejectedUserApiKeyHint).toBe(
        'Log in again, then retry:\n> COMPOSIO_ENVIRONMENT=staging composio login --agent'
      );
    }).pipe(Effect.provide(agentHomeLayer(STAGING.base, STAGING.web)))
  );

  it.effect('[Then] another 401 names `composio login --agent`, with no logout', () =>
    Effect.gen(function* () {
      yield* saveAgentIdentity('uak_stored');
      expect(yield* unauthorizedHint(unauthorized('Auth_InvalidApiKey'))).toEqual(
        Option.some('If your login expired, log in again, then retry:\n> composio login --agent')
      );
    }).pipe(Effect.provide(agentHomeLayer(PRODUCTION.base, PRODUCTION.web)))
  );

  it.effect('[Given] the saved agent owns another key [Then] it names the regular login', () =>
    Effect.gen(function* () {
      yield* saveAgentIdentity('uak_other');
      expect(yield* unauthorizedHint(unauthorized('Auth_InvalidApiKey'))).toEqual(
        Option.some(
          'If your login expired, log in again, then retry:\n> composio logout && composio login'
        )
      );
    }).pipe(Effect.provide(agentHomeLayer(PRODUCTION.base, PRODUCTION.web)))
  );
});
