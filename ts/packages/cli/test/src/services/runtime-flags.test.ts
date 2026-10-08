import { afterEach, vi } from 'vitest';
import { describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import {
  cliDebugFlagsLayer,
  debugFlagsToChildEnv,
  isPerfDebugEnabled,
  isTelemetryDebugEnabled,
  isToolDebugEnabled,
  NO_CLI_DEBUG_FLAG_OVERRIDES,
  readTelemetryDebugOverride,
  telemetryDebugModeLayer,
  TELEMETRY_DEBUG_FLAG,
} from 'src/services/runtime-flags';
import { extendConfigProvider } from 'src/services/config';
import { TestLive } from 'test/__utils__';

describe('debugFlagsToChildEnv', () => {
  it('[Given] resolved debug flags [Then] every flag serializes into the child environment', () => {
    expect(
      debugFlagsToChildEnv({
        perfDebug: true,
        toolDebug: false,
        telemetryDebug: false,
      })
    ).toEqual({
      COMPOSIO_PERF_DEBUG: '1',
      COMPOSIO_TOOL_DEBUG: '0',
      COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
    });
  });
});

describe('telemetry debug bootstrap', () => {
  it('reads an override without rewriting argv', () => {
    const argv = ['bun', 'composio', TELEMETRY_DEBUG_FLAG, 'whoami'];
    expect(readTelemetryDebugOverride(argv)).toBe(true);
    expect(argv).toEqual(['bun', 'composio', TELEMETRY_DEBUG_FLAG, 'whoami']);
  });
  it('ignores arguments after the delimiter', () => {
    expect(
      readTelemetryDebugOverride(['bun', 'composio', 'run', '--', TELEMETRY_DEBUG_FLAG])
    ).toBeUndefined();
  });
  it('supports an explicit false override', () => {
    expect(
      readTelemetryDebugOverride(['bun', 'composio', '--telemetry-debug=false', 'whoami'])
    ).toBe(false);
  });
  it('leaves absent overrides to configuration', () => {
    expect(readTelemetryDebugOverride(['bun', 'composio', 'whoami'])).toBeUndefined();
  });
});

const enabledDebugConfig = ConfigProvider.fromEnvRecord({
  COMPOSIO_PERF_DEBUG: '1',
  COMPOSIO_TOOL_DEBUG: '1',
  COMPOSIO_RUN_ACP_ONLY: '1',
}).pipe(extendConfigProvider);

const readAllDebugFlags = Effect.all({
  perfDebug: isPerfDebugEnabled,
  toolDebug: isToolDebugEnabled,
});

describe('debug flag precedence', () => {
  layer(TestLive())(it => {
    it.effect('[Given] no flags [Then] the COMPOSIO_* config decides', () =>
      Effect.gen(function* () {
        expect(yield* readAllDebugFlags).toEqual({
          perfDebug: true,
          toolDebug: true,
        });
      }).pipe(
        Effect.provide(cliDebugFlagsLayer(NO_CLI_DEBUG_FLAG_OVERRIDES)),
        Effect.provideService(ConfigProvider.ConfigProvider, enabledDebugConfig)
      )
    );

    it.effect('[Given] explicit false flags [Then] they beat the enabled config', () =>
      Effect.gen(function* () {
        expect(yield* readAllDebugFlags).toEqual({
          perfDebug: false,
          toolDebug: false,
        });
      }).pipe(
        Effect.provide(cliDebugFlagsLayer({ perfDebug: false, toolDebug: false })),
        Effect.provideService(ConfigProvider.ConfigProvider, enabledDebugConfig)
      )
    );
  });
});

describe('telemetry debug mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect('[Given] the bootstrap provided the flag [Then] it wins over the environment', () =>
    Effect.gen(function* () {
      vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DEBUG', '');

      expect(yield* isTelemetryDebugEnabled).toBe(true);
    }).pipe(Effect.provide(telemetryDebugModeLayer(true)))
  );

  it.effect('[Given] no bootstrap flag [Then] it falls back to COMPOSIO_CLI_TELEMETRY_DEBUG', () =>
    Effect.gen(function* () {
      vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DEBUG', 'true');
      expect(yield* isTelemetryDebugEnabled).toBe(true);

      vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DEBUG', '');
      expect(yield* isTelemetryDebugEnabled).toBe(false);
    })
  );
});
