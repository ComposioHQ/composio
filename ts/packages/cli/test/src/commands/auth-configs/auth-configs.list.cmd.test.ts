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
  {
    id: 'ac_slack_custom',
    name: 'Slack Custom',
    no_of_connections: 3,
    status: 'ENABLED',
    type: 'custom',
    uuid: 'uuid-2',
    toolkit: { logo: '', slug: 'slack' },
    auth_scheme: 'API_KEY',
    is_composio_managed: false,
    is_enabled_for_tool_router: false,
    created_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'ac_gmail_disabled',
    name: 'Gmail Disabled',
    no_of_connections: 0,
    status: 'DISABLED',
    type: 'default',
    uuid: 'uuid-3',
    toolkit: { logo: '', slug: 'gmail' },
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_enabled_for_tool_router: false,
    created_at: '2026-02-01T00:00:00Z',
  },
];

const authConfigsData = {
  items: testAuthConfigs,
} satisfies TestLiveInput['authConfigsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio manage auth-configs list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] no flags [Then] lists all auth configs',
    it => {
      it.scoped('lists all auth configs with table', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'auth-configs', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_gmail_default');
          expect(output).toContain('ac_slack_custom');
          expect(output).toContain('ac_gmail_disabled');
          expect(output).toContain('Listing 3 of 3 auth configs');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] --toolkits "gmail" [Then] lists only gmail auth configs',
    it => {
      it.scoped('filters by toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'auth-configs', 'list', '--toolkits', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_gmail_default');
          expect(output).toContain('ac_gmail_disabled');
          expect(output).not.toContain('ac_slack_custom');
          expect(output).toContain('Listing 2 of 2 auth configs');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] --query "Custom" [Then] shows filtered results',
    it => {
      it.scoped('filters by name search', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'auth-configs', 'list', '--query', 'Custom']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_slack_custom');
          expect(output).not.toContain('ac_gmail_default');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] --limit 1 [Then] respects limit',
    it => {
      it.scoped('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'auth-configs', 'list', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 1 of 3 auth configs');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['manage', 'auth-configs', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] empty results [Then] shows no auth configs found',
    it => {
      it.scoped('shows no auth configs found', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'auth-configs', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No auth configs found');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, authConfigsData }))(
    '[Given] --toolkits "nonexistent" [Then] shows hint about toolkit slug',
    it => {
      it.scoped('shows toolkit hint', () =>
        Effect.gen(function* () {
          yield* cli(['manage', 'auth-configs', 'list', '--toolkits', 'nonexistent']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No auth configs found');
          expect(output).toContain('composio manage toolkits list');
        })
      );
    }
  );
});
