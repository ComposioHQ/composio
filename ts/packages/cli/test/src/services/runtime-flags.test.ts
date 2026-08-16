import { afterEach, vi } from 'vitest';
import { describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import {
  cliDebugFlagsLayer,
  debugFlagsToChildEnv,
  isAcpOnlyEnabled,
  isPerfDebugEnabled,
  isTelemetryDebugEnabled,
  isToolDebugEnabled,
  NO_CLI_DEBUG_FLAG_OVERRIDES,
  stripTelemetryDebugFlag,
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
        acpOnly: true,
        telemetryDebug: false,
      })
    ).toEqual({
      COMPOSIO_PERF_DEBUG: '1',
      COMPOSIO_TOOL_DEBUG: '0',
      COMPOSIO_RUN_ACP_ONLY: '1',
      COMPOSIO_CLI_TELEMETRY_DEBUG: '0',
    });
  });
});

describe('stripTelemetryDebugFlag', () => {
  it('[Given] the flag before the delimiter [Then] it is removed and reported', () => {
    expect(stripTelemetryDebugFlag(['bun', 'composio', TELEMETRY_DEBUG_FLAG, 'whoami'])).toEqual({
      argv: ['bun', 'composio', 'whoami'],
      telemetryDebug: true,
    });
  });

  it('[Given] the flag after a `--` delimiter [Then] it belongs to the child and survives', () => {
    const argv = ['bun', 'composio', 'run', 'my-agent', '--', TELEMETRY_DEBUG_FLAG];

    expect(stripTelemetryDebugFlag(argv)).toEqual({ argv, telemetryDebug: false });
  });

  it('[Given] the flag on both sides of `--` [Then] only the CLI-side one is consumed', () => {
    expect(
      stripTelemetryDebugFlag([
        'bun',
        'composio',
        TELEMETRY_DEBUG_FLAG,
        'run',
        'my-agent',
        '--',
        TELEMETRY_DEBUG_FLAG,
      ])
    ).toEqual({
      argv: ['bun', 'composio', 'run', 'my-agent', '--', TELEMETRY_DEBUG_FLAG],
      telemetryDebug: true,
    });
  });

  it('[Given] no flag [Then] argv is reported unchanged', () => {
    const argv = ['bun', 'composio', 'whoami'];

    expect(stripTelemetryDebugFlag(argv)).toEqual({ argv, telemetryDebug: false });
  });
});

const enabledDebugConfig = ConfigProvider.fromMap(
  new Map([
    ['COMPOSIO_PERF_DEBUG', '1'],
    ['COMPOSIO_TOOL_DEBUG', '1'],
    ['COMPOSIO_RUN_ACP_ONLY', '1'],
  ])
).pipe(extendConfigProvider);

const readAllDebugFlags = Effect.all({
  perfDebug: isPerfDebugEnabled,
  toolDebug: isToolDebugEnabled,
  acpOnly: isAcpOnlyEnabled,
});

describe('debug flag precedence', () => {
  layer(TestLive())(it => {
    it.effect('[Given] no flags [Then] the COMPOSIO_* config decides', () =>
      Effect.gen(function* () {
        expect(yield* readAllDebugFlags).toEqual({
          perfDebug: true,
          toolDebug: true,
          acpOnly: true,
        });
      }).pipe(
        Effect.provide(cliDebugFlagsLayer(NO_CLI_DEBUG_FLAG_OVERRIDES)),
        Effect.withConfigProvider(enabledDebugConfig)
      )
    );

    it.effect('[Given] explicit false flags [Then] they beat the enabled config', () =>
      Effect.gen(function* () {
        expect(yield* readAllDebugFlags).toEqual({
          perfDebug: false,
          toolDebug: false,
          acpOnly: false,
        });
      }).pipe(
        Effect.provide(cliDebugFlagsLayer({ perfDebug: false, toolDebug: false, acpOnly: false })),
        Effect.withConfigProvider(enabledDebugConfig)
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
