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

  it.effect.each([
    { name: 'COMPOSIO_CLI_TELEMETRY_DISABLED', value: 'yes' },
    { name: 'COMPOSIO_DISABLE_TELEMETRY', value: 'true' },
    { name: 'TELEMETRY_DISABLED', value: '1' },
    { name: 'CI', value: 'true' },
    { name: 'NODE_ENV', value: 'test' },
  ])(
    '[Given] an opt-out, CI, or a test run ($name=$value) [Then] telemetry is disabled',
    ({ name, value }) =>
      Effect.gen(function* () {
        deepStrictEqual((yield* read({ [name]: value })).DISABLED, true);
      })
  );

  it.effect('[Given] CI off outside a test run [Then] telemetry stays on', () =>
    Effect.gen(function* () {
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
