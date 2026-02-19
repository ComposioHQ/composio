import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits, ToolkitDetailed } from 'src/models/toolkits';

const testToolkits: Toolkits = [
  {
    name: 'Gmail',
    slug: 'gmail',
    auth_schemes: ['OAUTH2', 'BEARER_TOKEN'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Email service to send and receive emails',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: [],
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
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: [],
      tools_count: 36,
      triggers_count: 2,
    },
    auth_config_details: [
      {
        mode: 'OAUTH2',
        name: 'OAuth 2.0',
        fields: {
          auth_config_creation: { required: [], optional: [] },
          connected_account_initiation: { required: [], optional: [] },
        },
      },
      {
        mode: 'BEARER_TOKEN',
        name: 'Bearer Token',
        fields: {
          auth_config_creation: {
            required: [
              {
                name: 'apiKey',
                displayName: 'API Key',
                description: 'Your API key',
                type: 'string',
                required: true,
                default: null,
              },
            ],
            optional: [],
          },
          connected_account_initiation: {
            required: [
              {
                name: 'apiKey',
                displayName: 'API Key',
                description: 'Your API key',
                type: 'string',
                required: true,
                default: null,
              },
            ],
            optional: [],
          },
        },
      },
    ],
  },
  {
    name: 'Code Interpreter',
    slug: 'codeinterpreter',
    is_local_toolkit: false,
    composio_managed_auth_schemes: [],
    no_auth: true,
    meta: {
      description: 'Execute code snippets',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: [],
      tools_count: 5,
      triggers_count: 0,
    },
    auth_config_details: [],
  },
];

const toolkitsData = {
  toolkits: testToolkits,
  detailedToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio toolkits info', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug "gmail"',
    it => {
      it.scoped('shows detailed info with auth schemes', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('gmail');
          expect(output).toContain('Email service to send and receive emails');
          expect(output).toContain('OAUTH2');
          expect(output).toContain('BEARER_TOKEN');
          expect(output).toContain('apiKey');
          expect(output).toContain('AuthConfig creation');
          expect(output).toContain('Connected Account creation');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] toolkit with no_auth=true',
    it => {
      it.scoped('shows "No authentication required"', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'codeinterpreter']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Code Interpreter');
          expect(output).toContain('No authentication required');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug',
    it => {
      it.scoped('shows error', () =>
        Effect.gen(function* () {
          const result = yield* cli(['toolkits', 'info', 'gmal']).pipe(Effect.either);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Failed to fetch toolkit "gmal"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug with substring match',
    it => {
      it.scoped('shows error with suggestion', () =>
        Effect.gen(function* () {
          // "gma" is a substring of "gmail", so the mock will find suggestions
          const result = yield* cli(['toolkits', 'info', 'gma']).pipe(Effect.either);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Failed to fetch toolkit "gma"');
          expect(output).toContain('Did you mean?');
          expect(output).toContain('gmail');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no slug argument',
    it => {
      it.scoped('shows missing argument warning with tip', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Missing required argument');
          expect(output).toContain('composio toolkits info "gmail"');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'info', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
