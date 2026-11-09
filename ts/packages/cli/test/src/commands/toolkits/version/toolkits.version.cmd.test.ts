import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits, ToolkitDetailed } from 'src/models/toolkits';

const versionHistory = Array.from({ length: 25 }, (_, index) => {
  const suffix = String(index + 1).padStart(2, '0');
  return `20260101_${suffix}`;
});

const testToolkits: Toolkits = [
  {
    name: 'Gmail',
    slug: 'gmail',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Email service to send and receive emails',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: versionHistory,
      tools_count: 36,
      triggers_count: 2,
    },
  },
];

const detailedToolkits: ToolkitDetailed[] = [
  {
    name: 'Gmail',
    slug: 'gmail',
    is_local_toolkit: false,
    composio_managed_auth_schemes: ['OAUTH2'],
    no_auth: false,
    meta: {
      description: 'Email service to send and receive emails',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: versionHistory,
      tools_count: 36,
      triggers_count: 2,
    },
    auth_config_details: [],
  },
];

const toolkitsData = {
  toolkits: testToolkits,
  detailedToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio dev toolkits version', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug [Then] shows latest and last 20 versions',
    it => {
      it.effect('prints latest version and truncates to last 20', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'version', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const json = JSON.parse(String(lines.at(-1)));

          expect(output).toContain('Toolkit: Gmail (gmail)');
          expect(output).toContain('Latest Version: 20260101_25');
          expect(output).toContain('Last 20 Available Versions:');
          expect(json).toMatchObject({
            slug: 'gmail',
            latest_version: '20260101_25',
            available_versions_last_20: versionHistory.slice(-20),
          });
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug [Then] shows error and hint',
    it => {
      it.effect('prints fetch failure and browse hint on a redirected stderr and exits 1', () =>
        Effect.gen(function* () {
          const terminal = redirectedTerminalUI();
          const exit = yield* Effect.exit(
            cli(['dev', 'toolkits', 'version', 'unknown']).pipe(Effect.provide(terminal.layer))
          );

          expect(terminal.stderr()).toContain('Toolkit "unknown" not found');
          expect(terminal.stderr()).toContain(
            'Browse available toolkits:\n> composio dev toolkits list\n'
          );
          expect(terminal.stdout()).toBe('');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'toolkits', 'version', 'gmail']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});
