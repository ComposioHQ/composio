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
      available_versions: ['20250101', '20250601', '20250909'],
      tools_count: 36,
      triggers_count: 2,
    },
  },
  {
    name: 'Code Interpreter',
    slug: 'codeinterpreter',
    auth_schemes: [],
    composio_managed_auth_schemes: [],
    is_local_toolkit: false,
    no_auth: true,
    meta: {
      description: 'Execute code in a sandboxed environment',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: [],
      tools_count: 1,
      triggers_count: 0,
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
      available_versions: ['20250101', '20250601', '20250909'],
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
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio toolkits info', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug "gmail"',
    it => {
      it.scoped('shows detailed info with connection status', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Gmail');
          expect(output).toContain('gmail');
          expect(output).toContain('Email service to send and receive emails');
          expect(output).toContain('Latest Version:');
          expect(output).toContain('20250909');
          expect(output).toContain('Tools Count: 36');
          expect(output).toContain('Triggers Count: 2');
          expect(output).toContain('Auth Modes: OAUTH2, BEARER_TOKEN');
          // Connection status
          expect(output).toContain('Not connected');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] toolkit with no_auth=true',
    it => {
      it.scoped('shows "no auth"', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'codeinterpreter']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Code Interpreter');
          expect(output).toContain('Execute code snippets');
          expect(output).toContain('Tools Count: 5');
          expect(output).toContain('No authentication required');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --all flag',
    it => {
      it.scoped('shows full auth config setup fields', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'gmail', '--all']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Auth Config Details:');
          expect(output).toContain('auth_config_creation.required');
          expect(output).toContain('connected_account_initiation.required');
          expect(output).toContain('apiKey');
          expect(output).toContain('API Key');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug',
    it => {
      it.scoped('shows error', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'gmal']).pipe(Effect.either);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Toolkit "gmal" not found');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug with substring match',
    it => {
      it.scoped('shows error with hint', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'info', 'gma']).pipe(Effect.either);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Toolkit "gma" not found');
          expect(output).toContain('composio toolkits info "gmail"');
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
