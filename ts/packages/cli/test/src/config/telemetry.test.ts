import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { Config, ConfigProvider, Effect } from 'effect';
import { TELEMETRY_CONFIG } from 'src/config';
import * as constants from 'src/constants';

const read = (env: Record<string, string>) =>
  Config.all(TELEMETRY_CONFIG).parse(ConfigProvider.fromEnvRecord(env));

describe('TELEMETRY_CONFIG', () => {
  it.effect('[Given] an empty environment [Then] telemetry is on and targets PostHog', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* read({}), {
        DISABLED: false,
        POSTHOG_INGEST_URL: constants.COMPOSIO_POSTHOG_INGEST_URL,
        POSTHOG_PROJECT_API_KEY: constants.COMPOSIO_POSTHOG_PROJECT_API_KEY,
      });
    })
  );

  it.effect('[Given] any opt-out, CI, or a test run [Then] telemetry is disabled', () =>
    Effect.gen(function* () {
      const optOuts: ReadonlyArray<Record<string, string>> = [
        { COMPOSIO_CLI_TELEMETRY_DISABLED: 'yes' },
        { COMPOSIO_DISABLE_TELEMETRY: 'true' },
        { TELEMETRY_DISABLED: '1' },
        { CI: 'true' },
        { NODE_ENV: 'test' },
      ];
      for (const env of optOuts) {
        deepStrictEqual((yield* read(env)).DISABLED, true, JSON.stringify(env));
      }
      deepStrictEqual((yield* read({ CI: 'false', NODE_ENV: 'development' })).DISABLED, false);
    })
  );

  it.effect('[Given] a PostHog override [Then] it replaces the baked target', () =>
    Effect.gen(function* () {
      const actual = yield* read({
        COMPOSIO_POSTHOG_INGEST_URL: 'https://posthog.example.test/i/v0/e/',
        COMPOSIO_POSTHOG_PROJECT_API_KEY: ' phc_test ',
      });
      deepStrictEqual(actual.POSTHOG_INGEST_URL, 'https://posthog.example.test/i/v0/e/');
      deepStrictEqual(actual.POSTHOG_PROJECT_API_KEY, 'phc_test');
    })
  );
});
