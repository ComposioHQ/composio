import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
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

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio auth-configs delete', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] valid ID with --yes [Then] deletes successfully',
    it => {
      it.scoped('shows success message', () =>
        Effect.gen(function* () {
          yield* cli(['auth-configs', 'delete', 'ac_gmail_default', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_gmail_default');
          expect(output).toContain('deleted');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] no ID [Then] warns missing argument',
    it => {
      it.scoped('shows missing argument warning', () =>
        Effect.gen(function* () {
          yield* cli(['auth-configs', 'delete']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] invalid ID with --yes [Then] shows error',
    it => {
      it.scoped('shows not found error', () =>
        Effect.gen(function* () {
          yield* cli(['auth-configs', 'delete', 'ac_nonexistent', '--yes']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
          expect(output).toContain('composio auth-configs list');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['auth-configs', 'delete', 'ac_gmail_default', '--yes']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
