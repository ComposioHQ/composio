import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
}).pipe(extendConfigProvider);

describe('CLI: composio dev', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.effect('renders generated help when developer mode is on', () =>
      Effect.gen(function* () {
        yield* cli(['dev', '--help']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('projects');
        expect(output).toContain('triggers');
        expect(output).toContain('--mode');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      cliUserConfig: { developerModeEnabled: false },
    })
  )(it => {
    it.effect('renders reduced help when developer mode is off', () =>
      Effect.gen(function* () {
        yield* cli(['dev', '--help']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('When off');
        expect(output).toContain('composio dev --mode on');
        expect(output).not.toContain('projects');
      })
    );

    it.effect('blocks dev subcommands when developer mode is off', () =>
      Effect.gen(function* () {
        expect((yield* Effect.result(cli(['dev', 'init'])))._tag).toBe('Failure');
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('When off');
        expect(output).toContain('composio dev --mode on');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.effect('persists mode changes through the config service', () =>
      Effect.gen(function* () {
        yield* cli(['dev', '--mode', 'off']);
        expect((yield* Effect.result(cli(['dev', 'init'])))._tag).toBe('Failure');
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('Developer mode disabled');
        expect(output).toContain('When off');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.effect('blocks destructive dev commands until config enables them', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(cli(['dev', 'triggers', 'disable', 'trg_123']));
        const output = String(error);

        expect(output).toContain('disabled by config');
        expect(output).toContain('developer.destructive_actions');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      cliUserConfig: { developerDangerousCommandsEnabled: true },
    })
  )(it => {
    it.effect('requires --dangerously-allow for destructive dev commands', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(cli(['dev', 'triggers', 'disable', 'trg_123']));
        const output = String(error);

        expect(output).toContain('requires explicit acknowledgement');
        expect(output).toContain('--dangerously-allow');
      })
    );
  });
});
