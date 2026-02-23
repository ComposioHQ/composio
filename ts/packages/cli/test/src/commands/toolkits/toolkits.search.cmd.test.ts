import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits } from 'src/models/toolkits';

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
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
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
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
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
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: ['20250101', '20260101'],
      tools_count: 42,
      triggers_count: 5,
    },
  },
];

const toolkitsData = {
  toolkits: testToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio toolkits search', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query "email"',
    it => {
      it.scoped('shows matching toolkits', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'search', 'email']);
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
      it.scoped('shows "No toolkits found"', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'search', 'xyzzy']);
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
      it.scoped('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'search', 'email', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Found 1 of 2 toolkits');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'search', 'email']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
