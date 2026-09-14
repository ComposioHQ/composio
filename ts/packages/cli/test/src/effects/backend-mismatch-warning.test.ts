import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { DEFAULT_BASE_URL, STAGING_BASE_URL, STAGING_WEB_URL } from 'src/constants';
import { warnOnBackendMismatch } from 'src/effects/backend-mismatch-warning';
import { requireAuth } from 'src/effects/require-auth';
import { extendConfigProvider } from 'src/services/config';
import { MockConsole, TestLive } from 'test/__utils__';

const stagingLogin = {
  api_key: 'uak_staging',
  base_url: STAGING_BASE_URL,
  web_url: STAGING_WEB_URL,
  org_id: 'org_staging',
};

const withEnv = (env: Record<string, string>) =>
  ConfigProvider.fromEnvRecord(env).pipe(extendConfigProvider);

const expectedWarning =
  'COMPOSIO_BASE_URL sends your stored API key to backend.composio.dev, but you logged in to staging-backend.composio.dev.';

describe('warnOnBackendMismatch', () => {
  layer(
    TestLive({
      userData: stagingLogin,
      baseConfigProvider: withEnv({ COMPOSIO_BASE_URL: DEFAULT_BASE_URL }),
    })
  )(it => {
    it.effect(
      '[Given] a stored staging login and COMPOSIO_BASE_URL on production [Then] warns once on stderr',
      () =>
        Effect.gen(function* () {
          yield* warnOnBackendMismatch;

          expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([expectedWarning]);
          expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([]);
        })
    );
  });

  layer(
    TestLive({
      userData: stagingLogin,
      baseConfigProvider: withEnv({ COMPOSIO_BASE_URL: DEFAULT_BASE_URL }),
    })
  )(it => {
    it.effect('[Given] a command gated by requireAuth [Then] it warns before running', () =>
      Effect.gen(function* () {
        expect(yield* requireAuth).toBe(true);
        expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([expectedWarning]);
      })
    );
  });

  layer(TestLive({ userData: stagingLogin }))(it => {
    it.effect('[Given] no override [Then] stays silent', () =>
      Effect.gen(function* () {
        yield* warnOnBackendMismatch;
        expect(yield* MockConsole.getLines()).toEqual([]);
      })
    );
  });

  layer(
    TestLive({
      userData: stagingLogin,
      baseConfigProvider: withEnv({ COMPOSIO_ENVIRONMENT: 'production' }),
    })
  )(it => {
    it.effect('[Given] COMPOSIO_ENVIRONMENT=production [Then] names COMPOSIO_ENVIRONMENT', () =>
      Effect.gen(function* () {
        yield* warnOnBackendMismatch;
        const stderr = (yield* MockConsole.getLines({ stream: 'stderr' })).join('\n');
        expect(stderr).toContain('COMPOSIO_ENVIRONMENT sends your stored API key');
      })
    );
  });

  layer(
    TestLive({
      userData: stagingLogin,
      baseConfigProvider: withEnv({
        COMPOSIO_BASE_URL: DEFAULT_BASE_URL,
        COMPOSIO_USER_API_KEY: 'uak_env',
      }),
    })
  )(it => {
    it.effect('[Given] the key comes from COMPOSIO_USER_API_KEY [Then] stays silent', () =>
      Effect.gen(function* () {
        yield* warnOnBackendMismatch;
        expect(yield* MockConsole.getLines()).toEqual([]);
      })
    );
  });

  layer(
    TestLive({
      userData: stagingLogin,
      baseConfigProvider: withEnv({ COMPOSIO_WEB_URL: 'https://dashboard.composio.dev/' }),
    })
  )(it => {
    it.effect('[Given] only COMPOSIO_WEB_URL is set [Then] stays silent', () =>
      Effect.gen(function* () {
        yield* warnOnBackendMismatch;
        expect(yield* MockConsole.getLines()).toEqual([]);
      })
    );
  });
});
