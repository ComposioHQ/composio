import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits, ToolkitDetailed } from 'src/models/toolkits';
import { APIError } from '@composio/client';
import { hasRecordedAuthRejection } from 'src/services/auth-rejection';
import { HttpServerError } from 'src/services/composio-clients';
import { userApiKeyRejectionBody } from 'test/__utils__/models/user-api-key-rejection';

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
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
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
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
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
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
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
      created_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
      updated_at: DateTime.makeUnsafe('2024-05-03T11:44:32.061Z'),
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

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
}).pipe(extendConfigProvider);

describe('CLI: composio dev toolkits info', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug "gmail"',
    it => {
      it.effect('shows detailed info with connection status', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'gmail']);
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

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
    })
  )(
    '[Given] no --user-id and no project test_user_id [Then] falls back to global test_user_id',
    it => {
      it.effect('uses global test user id for toolkit info', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Using global test user id "global-default"');
          expect(output).toContain('Gmail');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] toolkit with no_auth=true',
    it => {
      it.effect('shows "no auth"', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'codeinterpreter']);
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
      it.effect('shows full auth config setup fields', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'gmail', '--all']);
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
      it.effect('shows error', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'gmal']).pipe(Effect.result);
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
      it.effect('shows error with hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'gma']).pipe(Effect.result);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Toolkit "gma" not found');
          expect(output).toContain('composio dev toolkits info "gmail"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no slug argument',
    it => {
      it.effect('shows missing argument warning with tip', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Missing required argument');
          expect(output).toContain('composio dev toolkits info "gmail"');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'toolkits', 'info', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  describe('[Given] the backend rejects the stored key', () => {
    const storedStagingLogin = {
      api_key: 'uak_revoked',
      base_url: 'https://staging-backend.composio.dev',
      web_url: 'https://staging-dashboard.composio.dev/',
      org_id: 'org_staging',
    };
    const sdkRejection = () =>
      APIError.generate(401, userApiKeyRejectionBody, undefined, new Headers());

    layer(
      TestLive({
        toolkitsData,
        userData: storedStagingLogin,
        toolRouter: { create: () => Promise.reject(sdkRejection()) },
      })
    )(it => {
      it.effect(
        'Covers AE1. [When] session creation is rejected [Then] defers to the recovery block',
        () =>
          Effect.gen(function* () {
            yield* cli(['dev', 'toolkits', 'info', 'slack', '--user-id', 'alice']);
            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

            expect(output).not.toContain('Invalid or revoked user API key');
            expect(output).not.toContain('Browse available toolkits');
            expect(yield* hasRecordedAuthRejection).toBe(true);
          })
      );
    });

    layer(
      TestLive({
        toolkitsData,
        userData: storedStagingLogin,
        toolkitsRepositoryFailure: new HttpServerError({
          status: 401,
          cause: 'HTTP 401 Unauthorized',
          apiError: userApiKeyRejectionBody.error,
        }),
      })
    )(it => {
      it.effect('[When] the toolkit lookup is rejected [Then] prints no "not found" line', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'slack']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).not.toContain('Toolkit "slack" not found.');
          expect(output).not.toContain('Did you mean?');
          expect(yield* hasRecordedAuthRejection).toBe(true);
        })
      );
    });

    layer(
      TestLive({
        toolkitsData,
        userData: storedStagingLogin,
        toolRouter: {
          create: () =>
            Promise.reject(
              APIError.generate(
                500,
                { error: { message: 'Session service unavailable', slug: 'Internal_Error' } },
                undefined,
                new Headers()
              )
            ),
        },
      })
    )(it => {
      it.effect('[When] another API error occurs [Then] still prints its message', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'toolkits', 'info', 'slack', '--user-id', 'alice']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('Session service unavailable');
          expect(output).toContain('Browse available toolkits');
          expect(yield* hasRecordedAuthRejection).toBe(false);
        })
      );
    });
  });
});
