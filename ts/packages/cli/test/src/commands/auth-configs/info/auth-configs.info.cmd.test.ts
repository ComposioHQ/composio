import { assert, describe, expect, layer } from '@effect/vitest';
import { isUsageFailure } from 'src/commands/errors';
import { ConfigProvider, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { AuthConfigItem } from 'src/models/auth-configs';

const testAuthConfigs: AuthConfigItem[] = [
  {
    id: 'ac_gmail_default',
    name: 'Gmail Default',
    no_of_connections: 5,
    status: 'ENABLED',
    type: 'default',
    uuid: 'uuid-1',
    toolkit: { logo: '', slug: 'gmail' },
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_enabled_for_tool_router: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const authConfigsData = {
  items: testAuthConfigs,
} satisfies TestLiveInput['authConfigsData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio dev auth-configs info', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] valid ID [Then] displays auth config details',
    it => {
      it.effect('shows auth config details', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'info', 'ac_gmail_default']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail Default');
          expect(output).toContain('ac_gmail_default');
          expect(output).toContain('gmail');
          expect(output).toContain('OAUTH2');
          expect(output).toContain('ENABLED');
          expect(output).toContain('Yes'); // is_composio_managed
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] no ID [Then] fails with a usage error',
    it => {
      it.effect('raises a CommandInputError naming <id>', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'auth-configs', 'info']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            option: '<id>',
            message: expect.stringContaining('Missing required argument: <id>'),
          });
          // The invocation prints the message on stderr, and nothing else.
          assert(isUsageFailure(failure));
          expect(yield* MockConsole.getLines()).toEqual([failure.message]);
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] invalid ID [Then] shows error with hint',
    it => {
      it.effect('shows not found error', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['dev', 'auth-configs', 'info', 'ac_nonexistent']));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
          expect(output).toContain('composio dev auth-configs list');
          expect(exitCodeOf(exit)).toBe(1);
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'auth-configs', 'info', 'ac_gmail_default']).pipe(
          Effect.flip
        );
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});
