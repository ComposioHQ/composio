import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { Config, ConfigProvider, Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/config';
import * as constants from 'src/constants';

const read = <A>(config: Config.Config<A>, env: Record<string, string>) =>
  config.parse(ConfigProvider.fromEnvRecord(env));

const urls = Config.all({ base: APP_CONFIG.BASE_URL, web: APP_CONFIG.WEB_URL });

describe('APP_CONFIG', () => {
  it.effect('[Given] an empty environment [Then] every setting takes its default', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* read(Config.all(APP_CONFIG), {}), {
        USER_API_KEY: undefined,
        ENVIRONMENT: undefined,
        BASE_URL: constants.DEFAULT_BASE_URL,
        WEB_URL: constants.DEFAULT_WEB_URL,
        CACHE_DIR: undefined,
        SESSION_DIR: undefined,
        BIN_DIR: undefined,
        LOG_LEVEL: undefined,
        ORG_ID: undefined,
        PROJECT_ID: undefined,
        AGENTS_BASE_URL: undefined,
        WEBHOOK_SECRET: undefined,
        CLI_INVOCATION_ORIGIN: undefined,
        CLI_PARENT_RUN_ID: undefined,
        RUN_OUTPUT_DIR: undefined,
        DISABLE_CONNECTED_ACCOUNT_CACHE: true,
        TOOLKIT_VERSIONS: Option.none(),
      });
    })
  );

  it.effect('[Given] unprefixed names [Then] they are ignored', () =>
    Effect.gen(function* () {
      const actual = yield* read(
        Config.all({ apiKey: APP_CONFIG.USER_API_KEY, logLevel: APP_CONFIG.LOG_LEVEL }),
        { USER_API_KEY: 'api_key', LOG_LEVEL: 'Debug' }
      );
      deepStrictEqual(actual, { apiKey: undefined, logLevel: undefined });
    })
  );

  it.effect('[Given] every COMPOSIO_* variable [Then] values are trimmed and typed', () =>
    Effect.gen(function* () {
      const actual = yield* read(Config.all(APP_CONFIG), {
        COMPOSIO_USER_API_KEY: 'api_key',
        COMPOSIO_BASE_URL: 'https://test.localhost',
        COMPOSIO_WEB_URL: 'https://web.localhost',
        COMPOSIO_CACHE_DIR: '  /tmp/composio-cache  ',
        COMPOSIO_SESSION_DIR: '   ',
        COMPOSIO_BIN_DIR: '/usr/local/bin',
        COMPOSIO_LOG_LEVEL: 'Info',
        COMPOSIO_ORG_ID: 'org_1',
        COMPOSIO_PROJECT_ID: 'proj_1',
        COMPOSIO_AGENTS_BASE_URL: 'https://agents.localhost',
        COMPOSIO_WEBHOOK_SECRET: 'secret',
        COMPOSIO_CLI_INVOCATION_ORIGIN: 'run',
        COMPOSIO_CLI_PARENT_RUN_ID: 'run_parent',
        COMPOSIO_RUN_OUTPUT_DIR: '\t/tmp/composio-output\n',
        COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE: 'OFF',
        COMPOSIO_TOOLKIT_VERSION_GMAIL: '20250901_00',
      });
      deepStrictEqual(actual, {
        USER_API_KEY: 'api_key',
        ENVIRONMENT: undefined,
        BASE_URL: 'https://test.localhost',
        WEB_URL: 'https://web.localhost',
        CACHE_DIR: '/tmp/composio-cache',
        SESSION_DIR: undefined,
        BIN_DIR: '/usr/local/bin',
        LOG_LEVEL: 'Info',
        ORG_ID: 'org_1',
        PROJECT_ID: 'proj_1',
        AGENTS_BASE_URL: 'https://agents.localhost',
        WEBHOOK_SECRET: 'secret',
        CLI_INVOCATION_ORIGIN: 'run',
        CLI_PARENT_RUN_ID: 'run_parent',
        RUN_OUTPUT_DIR: '/tmp/composio-output',
        DISABLE_CONNECTED_ACCOUNT_CACHE: false,
        TOOLKIT_VERSIONS: Option.some({ GMAIL: '20250901_00' }),
      });
    })
  );

  it.effect('[Given] COMPOSIO_ENVIRONMENT [Then] it picks the URL defaults', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* read(urls, { COMPOSIO_ENVIRONMENT: 'staging' }), {
        base: constants.STAGING_BASE_URL,
        web: constants.STAGING_WEB_URL,
      });
      deepStrictEqual(yield* read(urls, { COMPOSIO_ENVIRONMENT: 'production' }), {
        base: constants.DEFAULT_BASE_URL,
        web: constants.DEFAULT_WEB_URL,
      });
      deepStrictEqual(yield* read(urls, { COMPOSIO_ENVIRONMENT: 'unknown' }), {
        base: constants.DEFAULT_BASE_URL,
        web: constants.DEFAULT_WEB_URL,
      });
    })
  );

  it.effect('[Given] an explicit URL [Then] it beats the COMPOSIO_ENVIRONMENT default', () =>
    Effect.gen(function* () {
      deepStrictEqual(
        yield* read(urls, {
          COMPOSIO_ENVIRONMENT: 'staging',
          COMPOSIO_BASE_URL: 'https://custom-backend.localhost',
        }),
        { base: 'https://custom-backend.localhost', web: constants.STAGING_WEB_URL }
      );
      deepStrictEqual(
        yield* read(urls, {
          COMPOSIO_ENVIRONMENT: 'staging',
          COMPOSIO_WEB_URL: 'https://custom-web.localhost',
        }),
        { base: constants.STAGING_BASE_URL, web: 'https://custom-web.localhost' }
      );
    })
  );
});
