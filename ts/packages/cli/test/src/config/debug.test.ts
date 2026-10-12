import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { Config, ConfigProvider, Effect } from 'effect';
import { DEBUG_CONFIG } from 'src/config';

const read = (env: Record<string, string>) =>
  Config.all(DEBUG_CONFIG).parse(ConfigProvider.fromEnvRecord(env));

describe('DEBUG_CONFIG', () => {
  it.effect('[Given] an empty environment [Then] every toggle is off', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* read({}), {
        PERF_DEBUG: false,
        TOOL_DEBUG: false,
        TELEMETRY_DEBUG: false,
        UPGRADE_TARGET: undefined,
        VERSION: undefined,
        FORCE_USE_CACHE: false,
      });
    })
  );

  it.effect('[Given] misspelled override names [Then] they are ignored', () =>
    Effect.gen(function* () {
      const actual = yield* read({
        COMPOSIO_UPGRADE_TARGET: 'x',
        COMPOSIO_DEBUG_OVERRIDE_VERSION: 'x',
        UPGRADE_TARGET: 'x',
      });
      deepStrictEqual(actual.UPGRADE_TARGET, undefined);
      deepStrictEqual(actual.VERSION, undefined);
    })
  );

  it.effect('[Given] every variable [Then] values are read as written', () =>
    Effect.gen(function* () {
      deepStrictEqual(
        yield* read({
          COMPOSIO_PERF_DEBUG: '1',
          COMPOSIO_TOOL_DEBUG: 'true',
          COMPOSIO_CLI_TELEMETRY_DEBUG: 'yes',
          DEBUG_OVERRIDE_UPGRADE_TARGET: './composio',
          DEBUG_OVERRIDE_VERSION: '9.9.9',
          FORCE_USE_CACHE: 'true',
        }),
        {
          PERF_DEBUG: true,
          TOOL_DEBUG: true,
          TELEMETRY_DEBUG: true,
          UPGRADE_TARGET: './composio',
          VERSION: '9.9.9',
          FORCE_USE_CACHE: true,
        }
      );
    })
  );
});
