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
      available_versions: ['20250101', '20250909'],
      tools_count: 36,
      triggers_count: 2,
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
      available_versions: [],
      tools_count: 42,
      triggers_count: 5,
    },
  },
  {
    name: 'GitHub',
    slug: 'github',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Code hosting and collaboration platform',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: ['20260101'],
      tools_count: 50,
      triggers_count: 10,
    },
  },
];

const toolkitsData = {
  toolkits: testToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio toolkits list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no flags [Then] lists all toolkits',
    it => {
      it.scoped('lists all toolkits', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('gmail');
          expect(output).toContain('Slack');
          expect(output).toContain('GitHub');
          // Connection status column
          expect(output).toContain('Connected');
          expect(output).toContain('Listing 3 of 3 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --query "email"',
    it => {
      it.scoped('shows filtered results', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'list', '--query', 'email']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).not.toContain('GitHub');
          expect(output).toContain('Listing 1 of 1 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 2',
    it => {
      it.scoped('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'list', '--limit', '2']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 2 of 3 toolkits');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('[Given] empty results', it => {
    it.scoped('shows no toolkits found', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('No toolkits found');
      })
    );
  });
});
