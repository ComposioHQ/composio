import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { ToolkitDetailed, Toolkits } from 'src/models/toolkits';
import type { SessionToolkitsResponse } from '@composio/client/resources/tool-router';

const testToolkits: Toolkits = [
  {
    name: 'BigMailer',
    slug: 'bigmailer',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Bulk outreach suite with Gmail sync',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: [],
      tools_count: 12,
      triggers_count: 0,
    },
  },
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
    available_versions: ['20250909'],
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

describe('CLI: composio dev toolkits search', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query "email"',
    it => {
      it.scoped('shows matching toolkits', () =>
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

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        ...toolkitsData,
        searchToolkits: () =>
          Effect.succeed({
            items: [testToolkits[1]!, testToolkits[2]!],
            total_items: 2,
            total_pages: 1,
            next_cursor: null,
          }),
      },
    })
  )('[Given] semantic backend matches without lexical overlap', it => {
    it.scoped('preserves backend semantic results instead of filtering them locally', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'search', 'inbox automation']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Gmail');
        expect(output).toContain('Outlook');
        expect(output).toContain('Found 2 of 2 toolkits');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        ...toolkitsData,
        searchToolkits: () =>
          Effect.succeed({
            items: [] as Toolkits,
            total_items: 0,
            total_pages: 0,
            next_cursor: null,
          }),
      },
    })
  )('[Given] a partial slug query with no backend matches', it => {
    it.scoped('uses the local slug fallback without overriding semantic results', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'search', 'gmai', '--limit', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Gmail');
        expect(output).toContain('Found 1 of 2 toolkits');
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
  )(
    '[Given] an exact slug query with no catalog/search results [Then] uses detailed lookup',
    it => {
      it.scoped('returns the exact toolkit directly', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'gmail', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('Found 1 of 1 toolkits');
        })
      );
    }
  );

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
        yield* cli(['dev', 'toolkits', 'search', 'gmai', '--limit', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Gmail');
        expect(output).toContain('Found 1 of 1 toolkits');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] a matching query with --limit 1',
    it => {
      it.scoped('respects the backend search limit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'email', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).not.toContain('Slack');
          expect(output).toContain('Found 1 of 2 toolkits');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query with no results',
    it => {
      it.scoped('shows "No toolkits found"', () =>
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
      it.scoped('respects limit', () =>
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
    '[Given] --limit 51',
    it => {
      it.scoped('rejects limits above the Tool Router maximum', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'search', 'email', '--limit', '51']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain(
            'Invalid `--limit` value: 51. Expected an integer between 1 and 50.'
          );
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'search', 'email']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
