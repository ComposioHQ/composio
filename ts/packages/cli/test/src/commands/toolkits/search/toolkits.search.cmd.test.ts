import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect, Layer } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits } from 'src/models/toolkits';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { notFoundError } from 'test/__utils__/layers/not-found';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

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
      available_versions: ['20250909'],
      tools_count: 36,
      triggers_count: 2,
    },
  },
  {
    name: 'Outlook',
    slug: 'outlook',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Microsoft email service',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: [],
      tools_count: 28,
      triggers_count: 1,
    },
  },
  {
    name: 'Slack',
    slug: 'slack',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Messaging platform for teams',
      categories: [],
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      available_versions: ['20250101', '20260101'],
      tools_count: 42,
      triggers_count: 5,
    },
  },
];

const toolkitsData = {
  toolkits: testToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio dev toolkits search', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query "email"',
    it => {
      it.effect('shows matching toolkits', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'email']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('Outlook');
          expect(output).not.toContain('Slack');
          expect(output).toContain('Found 2 of 2 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query with no results',
    it => {
      it.effect('shows "No toolkits found"', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'xyzzy']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No toolkits found');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 1',
    it => {
      it.effect('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'email', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Found 1 of 2 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query "email" and --limit 0 [Then] the limit is clamped to 1',
    it => {
      it.effect('requests one toolkit and writes the rows as JSON to stdout', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'email', '--limit', '0']);
          const stderr = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' });
          const stdout = yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' });

          expect(stderr.join('\n')).toContain('Found 1 of 2 toolkits');
          expect(stderr.join('\n')).toContain(
            'To view details:\n> composio dev toolkits info "gmail"'
          );
          expect(stdout).toHaveLength(1);
          expect(JSON.parse(String(stdout[0]))).toEqual([
            expect.objectContaining({ slug: 'gmail', latest_version: '20250909', connected: null }),
          ]);
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] the search request fails',
    it => {
      it.effect('[Then] prints the error, writes `[]` to stdout and exits 1', () =>
        Effect.gen(function* () {
          const repository = Layer.succeed(
            ComposioToolkitsRepository,
            makeToolkitsRepositoryStub({
              searchToolkits: () => Effect.fail(notFoundError('Search unavailable')),
            })
          );
          // Redirected streams, as under a script: only plain stderr lines and stdout data show.
          const terminal = redirectedTerminalUI();
          const exit = yield* Effect.exit(
            cli(['dev', 'toolkits', 'search', 'email']).pipe(
              Effect.provide(Layer.mergeAll(repository, terminal.layer))
            )
          );

          expect(terminal.stderr()).toBe('Search unavailable\n');
          expect(terminal.stdout()).toBe('[]\n');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'toolkits', 'search', 'email']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});
