import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { rejectedUserApiKeyHint } from 'src/effects/rejected-user-api-key';
import { ComposioUserContext } from 'src/services/user-context';

const PRODUCTION = { base: 'https://backend.composio.dev', web: 'https://dashboard.composio.dev/' };
const STAGING = {
  base: 'https://staging-backend.composio.dev',
  web: 'https://staging-dashboard.composio.dev/',
};

/** The hint for a stored login whose resolved backend is `baseURL` with its Dashboard at `webURL`. */
const hintFor = (baseURL: string, webURL: string, env: Record<string, string> = {}) =>
  rejectedUserApiKeyHint.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
        Layer.succeed(
          ComposioUserContext,
          ComposioUserContext.of({
            data: {
              apiKey: Option.some('uak_stored'),
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
      )
    )
  );

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
