import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { filterToolkitsForListQuery } from 'src/commands/toolkits/commands/toolkits.list.cmd';
// filterToolkitsForListQuery is a re-export of filterToolkitsByQuery from toolkit-ranking.ts
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ToolkitDetailed, Toolkits } from 'src/models/toolkits';
import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';
import { it } from 'vitest';

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

const gmailDetailedToolkit: ToolkitDetailed = {
  name: 'Gmail',
  slug: 'gmail',
  is_local_toolkit: false,
  composio_managed_auth_schemes: ['OAUTH2'],
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
  auth_config_details: [
    {
      mode: 'OAUTH2',
      name: 'OAuth 2.0',
      fields: {
        auth_config_creation: {
          required: [],
          optional: [],
        },
        connected_account_initiation: {
          required: [],
          optional: [],
        },
      },
    },
  ],
};

const gmailSessionToolkit: SessionToolkitsResponse.Item = {
  slug: 'gmail',
  name: 'Gmail',
  meta: {
    description: 'Email service to send and receive emails',
    logo: '',
  },
  is_no_auth: false,
  enabled: true,
  connected_account: null,
  composio_managed_auth_schemes: ['OAUTH2'],
};

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev toolkits list', () => {
  it('[Given] a partial list query [Then] it filters by slug, name, or description without fuzzy matches', () => {
    expect(filterToolkitsForListQuery(testToolkits, 'gmai').map(toolkit => toolkit.slug)).toEqual([
      'gmail',
    ]);
    expect(filterToolkitsForListQuery(testToolkits, 'Email').map(toolkit => toolkit.slug)).toEqual([
      'gmail',
    ]);
    expect(filterToolkitsForListQuery(testToolkits, 'gmal')).toEqual([]);
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no flags [Then] lists all toolkits with unified table',
    it => {
      it.scoped('lists all toolkits with catalog and connection columns', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('gmail');
          expect(output).toContain('Slack');
          expect(output).toContain('GitHub');
          expect(output).toContain('Connected');
          expect(output).toContain('Version');
          expect(output).toContain('Listing 3 of 3 toolkits');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] no --user-id and no project test_user_id [Then] falls back to global test_user_id',
    it => {
      it.scoped('shows connected column with global test user id', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Connected');
          expect(output).toContain('Using global test user id "global-default"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] explicit --user-id [Then] shows connected status column',
    it => {
      it.scoped('shows connected column with explicit user id', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--user-id', 'default']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Connected');
          expect(output).toContain('Listing 3 of 3 toolkits');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        ...toolkitsData,
        searchToolkits: () =>
          Effect.succeed({
            items: [],
            total_items: 0,
            total_pages: 0,
            next_cursor: null,
          }),
      },
    })
  )('[Given] an empty search response [Then] falls back to cached toolkit filtering', it => {
    it.scoped('returns matching toolkits from the cached catalog', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list', '--query', 'gmai', '--limit', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Gmail');
        expect(output).not.toContain('GitHub');
        expect(output).toContain('Listing 1 of 1 toolkits');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        detailedToolkits: [gmailDetailedToolkit],
        searchToolkits: () =>
          Effect.succeed({
            items: [],
            total_items: 0,
            total_pages: 0,
            next_cursor: null,
          }),
      },
    })
  )('[Given] an exact slug query with no catalog data [Then] uses detailed toolkit lookup', it => {
    it.scoped('returns the exact toolkit without depending on catalog fallbacks', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list', '--query', 'gmail', '--limit', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Gmail');
        expect(output).toContain('Listing 1 of 1 toolkits');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        searchToolkits: () =>
          Effect.succeed({
            items: [],
            total_items: 0,
            total_pages: 0,
            next_cursor: null,
          }),
      },
      toolRouter: {
        toolkits: async () => ({
          items: [gmailSessionToolkit],
          current_page: 1,
          total_items: 1,
          total_pages: 1,
          next_cursor: null,
        }),
      },
    })
  )('[Given] no catalog results [Then] falls back to Tool Router session toolkits', it => {
    it.scoped('returns matching toolkits from the session fallback', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list', '--query', 'gmai', '--limit', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Gmail');
        expect(output).toContain('Listing 1 of 1 toolkits');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --query "email"',
    it => {
      it.scoped('shows filtered results', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--query', 'email']);
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
          yield* cli(['dev', 'toolkits', 'list', '--limit', '2']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 2 of 3 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 51',
    it => {
      it.scoped('rejects limits above the Tool Router maximum', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--limit', '51']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain(
            'Invalid `--limit` value: 51. Expected an integer between 1 and 50.'
          );
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 0',
    it => {
      it.scoped('rejects limits below the Tool Router minimum', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'list', '--limit', '0']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain(
            'Invalid `--limit` value: 0. Expected an integer between 1 and 50.'
          );
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('[Given] empty results', it => {
    it.scoped('shows no toolkits found', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('No toolkits found');
      })
    );
  });
});
