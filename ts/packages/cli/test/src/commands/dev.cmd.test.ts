import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.scoped('renders custom help when developer mode is on', () =>
      Effect.gen(function* () {
        yield* cli(['dev', '--help']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('PROJECT');
        expect(output).toContain('GUARDED');
        expect(output).toContain('--mode <on|off>');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      cliUserConfig: { developerModeEnabled: false },
    })
  )(it => {
    it.scoped('renders reduced help when developer mode is off', () =>
      Effect.gen(function* () {
        yield* cli(['dev', '--help']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('Developer mode is off');
        expect(output).toContain('composio dev --mode on');
        expect(output).not.toContain('PROJECT');
      })
    );

    it.scoped('blocks dev subcommands when developer mode is off', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'init']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('Developer mode is off');
        expect(output).toContain('composio dev --mode on');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.scoped('persists mode changes through the config service', () =>
      Effect.gen(function* () {
        yield* cli(['dev', '--mode', 'off']);
        yield* cli(['dev', 'init']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('Developer mode disabled');
        expect(output).toContain('Developer mode is off');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    it.scoped('blocks destructive dev commands until config enables them', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'disable', 'trg_123']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

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
    it.scoped('requires --dangerously-allow for destructive dev commands', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'disable', 'trg_123']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('requires explicit acknowledgement');
        expect(output).toContain('--dangerously-allow');
      })
    );
  });
});
