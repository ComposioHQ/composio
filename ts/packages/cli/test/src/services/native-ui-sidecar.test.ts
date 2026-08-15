import { describe, expect, it } from '@effect/vitest';
import { CommandExecutor, Error as PlatformError } from '@effect/platform';
import { ConfigProvider, Effect, Layer } from 'effect';
import {
  detectNativeUiCallerAgentEffect,
  interactivePermissionUiDisabledConfig,
} from 'src/services/native-ui-sidecar';
import { UNPREFIXED_CONFIG } from 'src/effects/app-config';

const loadFlag = (entries: Record<string, string>) =>
  ConfigProvider.fromMap(new Map(Object.entries(entries))).load(
    interactivePermissionUiDisabledConfig
  );

const executorLayer = (start: Parameters<typeof CommandExecutor.makeExecutor>[0]) =>
  Layer.succeed(CommandExecutor.CommandExecutor, CommandExecutor.makeExecutor(start));

// Environment-based detection must resolve before `ps` is ever spawned.
const processTreeMustNotRun = executorLayer(() =>
  Effect.die(new Error('the process tree must not be consulted'))
);

// Spawn failures during the process-tree walk resolve to the default agent.
const processTreeUnavailable = executorLayer(() =>
  Effect.fail(
    new PlatformError.SystemError({ reason: 'NotFound', module: 'Command', method: 'spawn' })
  )
);

const detectAgent = (
  env: Record<string, string>,
  layer: Layer.Layer<CommandExecutor.CommandExecutor>
) =>
  Effect.gen(function* () {
    const signals = yield* ConfigProvider.fromMap(new Map(Object.entries(env)), {
      pathDelim: '_',
    }).load(UNPREFIXED_CONFIG.CALLER_AGENT_SIGNALS);
    return yield* detectNativeUiCallerAgentEffect(signals);
  }).pipe(Effect.provide(layer));

describe('native UI sidecar', () => {
  it.effect('disables interactive permission UI in CI and Vitest environments', () =>
    Effect.gen(function* () {
      expect(yield* loadFlag({})).toBe(false);
      expect(yield* loadFlag({ CI: 'true' })).toBe(true);
      expect(yield* loadFlag({ CI: '1' })).toBe(true);
      expect(yield* loadFlag({ CI: 'woohoo' })).toBe(true);
      expect(yield* loadFlag({ CI: 'false' })).toBe(false);
      expect(yield* loadFlag({ CI: '' })).toBe(false);
      expect(yield* loadFlag({ VITEST: 'true' })).toBe(true);
    })
  );

  it.effect(
    'lets COMPOSIO_DISABLE_PERMISSION_UI override environment detection in both directions',
    () =>
      Effect.gen(function* () {
        expect(yield* loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: '1' })).toBe(true);
        expect(yield* loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: 'true' })).toBe(true);
        expect(
          yield* loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: '0', CI: 'true', VITEST: 'true' })
        ).toBe(false);
        expect(yield* loadFlag({ COMPOSIO_DISABLE_PERMISSION_UI: '', CI: 'true' })).toBe(true);
      })
  );

  it.effect('honours explicit caller-agent overrides without consulting the process tree', () =>
    Effect.gen(function* () {
      expect(yield* detectAgent({ COMPOSIO_CALLER_AGENT: 'Claude' }, processTreeMustNotRun)).toBe(
        'claude'
      );
      expect(yield* detectAgent({ COMPOSIO_AGENT: 'open-claw' }, processTreeMustNotRun)).toBe(
        'openclaw'
      );
      expect(
        yield* detectAgent(
          { COMPOSIO_CALLER_AGENT: 'codex', CLAUDE_CODE: '1' },
          processTreeMustNotRun
        )
      ).toBe('codex');
    })
  );

  it.effect('detects the caller agent from environment prefixes', () =>
    Effect.gen(function* () {
      expect(yield* detectAgent({ OPENCLAW_FUTURE_MARKER: '1' }, processTreeMustNotRun)).toBe(
        'openclaw'
      );
      expect(yield* detectAgent({ CLAUDE_FUTURE_MARKER: 'cli' }, processTreeMustNotRun)).toBe(
        'claude'
      );
      expect(yield* detectAgent({ CODEX_FUTURE_MARKER: '1' }, processTreeMustNotRun)).toBe('codex');
    })
  );

  it.effect(
    'falls back to composio when nothing matches and the process tree cannot be walked',
    () =>
      Effect.gen(function* () {
        expect(yield* detectAgent({}, processTreeUnavailable)).toBe('composio');
      })
  );
});
