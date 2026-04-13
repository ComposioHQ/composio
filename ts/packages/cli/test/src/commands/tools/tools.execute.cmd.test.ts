import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { vi, beforeEach, afterEach } from 'vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { ComposioNoActiveConnectionError } from 'src/services/composio-error-overrides';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import * as consumerShortTermCache from 'src/services/consumer-short-term-cache';
import * as composioClients from 'src/services/composio-clients';
import * as redactModule from 'src/ui/redact';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import { showToolsExecuteInputHelp } from 'src/commands/tools/commands/tools.execute.cmd';
import type { ToolkitDetailed } from 'src/models/toolkits';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const parseLastJson = (lines: ReadonlyArray<string>) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as {
        successful: boolean;
        data: Record<string, unknown>;
        error: string | null;
        logId: string;
      };
    } catch {
      // keep searching for the last JSON line
    }
  }
  throw new Error('Expected JSON output but none found');
};

describe('CLI: composio execute', () => {
  // Disable CI redaction so tests see raw values.
  // The explicit CI-redaction test overrides via vi.spyOn and is unaffected.
  let savedCI: string | undefined;
  beforeEach(() => {
    savedCI = process.env.CI;
    delete process.env.CI;
    vi.spyOn(composioClients, 'getLatestToolVersion').mockImplementation(() =>
      Effect.fail(new composioClients.HttpServerError({}))
    );
    vi.spyOn(consumerShortTermCache, 'getFreshConsumerConnectedToolkitsFromCache').mockReturnValue(
      Effect.succeed(Option.some(['gmail', 'github']))
    );
    vi.spyOn(consumerShortTermCache, 'refreshConsumerConnectedToolkitsCache').mockImplementation(
      () => Effect.succeed(['gmail', 'github'])
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (savedCI !== undefined) process.env.CI = savedCI;
  });

  let recordedSessionCreateParams: Array<Record<string, unknown>> = [];
  beforeEach(() => {
    recordedSessionCreateParams = [];
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d inline JSON [Then] executes via Tool Router with defaults', it => {
    it.scoped('executes via Tool Router with defaults', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_SEND_EMAIL',
          '--skip-connection-check',
          '-d',
          '{"recipient":"a"}',
        ]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);

        // Response flows through real ToolsExecutorLive → mock session.execute
        expect(output.successful).toBe(true);
        expect(output.data.tool_slug).toBe('GMAIL_SEND_EMAIL');
        expect(output.data.arguments).toEqual({ recipient: 'a' });
        expect(output.logId).toBe('log_test');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {
            content: 'token '.repeat(20_000),
          },
          error: null,
          successful: true,
          logId: 'log_large_output',
        },
      },
    })
  )(
    '[Given] a large execution response during composio run [Then] it stays inline instead of storing a temp file',
    it => {
      it.scoped('returns the full JSON payload when invocation origin is run', () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'run');

          yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines) as unknown as {
            successful: boolean;
            storedInFile?: boolean;
            outputFilePath?: string;
            data: {
              content: string;
            };
          };

          expect(output.successful).toBe(true);
          expect(output.storedInFile).not.toBe(true);
          expect(output.outputFilePath).toBeUndefined();
          expect(output.data.content).toContain('token token token');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      connectedAccountsData: {
        items: [
          {
            id: 'con_gmail_default',
            alias: 'default',
            word_id: 'castle',
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'consumer-user-org_test',
            toolkit: { slug: 'gmail' },
            auth_config: {
              id: 'ac_gmail_oauth',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            test_request_endpoint: '',
          },
          {
            id: 'con_gmail_secondary',
            alias: 'work',
            word_id: 'forest',
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'consumer-user-org_test',
            toolkit: { slug: 'gmail' },
            auth_config: {
              id: 'ac_gmail_oauth',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            test_request_endpoint: '',
          },
        ],
      },
      toolRouter: {
        create: async params => {
          recordedSessionCreateParams.push(params as unknown as Record<string, unknown>);
          return {
            session_id: 'trs_gmail_default_session',
            config: { user_id: params.user_id },
            mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
            tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
          };
        },
        execute: async (_sessionId, params) => ({
          data: { tool_slug: params.tool_slug, arguments: params.arguments },
          error: null,
          log_id: 'log_gmail_default',
        }),
      },
    })
  )('[Given] default alias exists [Then] execute pins the default connected account', it => {
    it.scoped('passes connected_accounts with the default alias account', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_SEND_EMAIL',
          '--skip-connection-check',
          '-d',
          '{"recipient":"a"}',
        ]);

        expect(recordedSessionCreateParams[0]?.connected_accounts).toEqual({
          gmail: 'con_gmail_default',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      connectedAccountsData: {
        items: [
          {
            id: 'con_gmail_default',
            alias: 'default',
            word_id: 'castle',
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'consumer-user-org_test',
            toolkit: { slug: 'gmail' },
            auth_config: {
              id: 'ac_gmail_oauth',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            test_request_endpoint: '',
          },
          {
            id: 'con_gmail_secondary',
            alias: 'work',
            word_id: 'forest',
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'consumer-user-org_test',
            toolkit: { slug: 'gmail' },
            auth_config: {
              id: 'ac_gmail_oauth',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            test_request_endpoint: '',
          },
        ],
      },
      toolRouter: {
        create: async params => {
          recordedSessionCreateParams.push(params as unknown as Record<string, unknown>);
          return {
            session_id: 'trs_gmail_explicit_session',
            config: { user_id: params.user_id },
            mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
            tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
          };
        },
        execute: async (_sessionId, params) => ({
          data: { tool_slug: params.tool_slug, arguments: params.arguments },
          error: null,
          log_id: 'log_gmail_explicit',
        }),
      },
    })
  )('[Given] --account selector [Then] execute pins the matched connected account', it => {
    it.scoped('matches by alias, word_id, or id', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_SEND_EMAIL',
          '--account',
          'forest',
          '--skip-connection-check',
          '-d',
          '{"recipient":"a"}',
        ]);

        expect(recordedSessionCreateParams[0]?.connected_accounts).toEqual({
          gmail: 'con_gmail_secondary',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      connectedAccountsData: {
        items: [
          {
            id: 'con_posthog_active',
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'consumer-user-org_test',
            toolkit: { slug: 'posthog' },
            auth_config: {
              id: 'ac_posthog_custom',
              auth_scheme: 'BEARER_TOKEN',
              is_composio_managed: false,
              is_disabled: false,
            },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            test_request_endpoint: '',
          },
        ],
      },
      toolRouter: {
        create: async params => {
          recordedSessionCreateParams.push(params as unknown as Record<string, unknown>);
          return {
            session_id: 'trs_posthog_test_session',
            config: { user_id: params.user_id },
            mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
            tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
          };
        },
        execute: async (_sessionId, params) => ({
          data: { tool_slug: params.tool_slug, arguments: params.arguments },
          error: null,
          log_id: 'log_posthog_test',
        }),
      },
    })
  )(
    '[Given] a non-managed connected account [Then] execute preloads auth configs into the Tool Router session',
    it => {
      it.scoped('passes explicit auth_configs for custom auth toolkits', () =>
        Effect.gen(function* () {
          yield* cli([
            'execute',
            'POSTHOG_RUN_ENDPOINT',
            '--skip-checks',
            '-d',
            '{"project_id":"196278","name":"test"}',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);

          expect(output.successful).toBe(true);
          expect(recordedSessionCreateParams).toHaveLength(1);
          expect(recordedSessionCreateParams[0]?.user_id).toEqual(expect.any(String));
          expect(recordedSessionCreateParams[0]?.auth_configs).toEqual({
            posthog: 'ac_posthog_custom',
          });
          expect(recordedSessionCreateParams[0]?.connected_accounts).toEqual({
            posthog: 'con_posthog_active',
          });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolRouter: {
        create: async params => {
          recordedSessionCreateParams.push(params as unknown as Record<string, unknown>);
          return {
            session_id: 'trs_posthog_cached_session',
            config: { user_id: params.user_id },
            mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
            tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MANAGE_CONNECTIONS'],
          };
        },
        execute: async (_sessionId, params) => ({
          data: { tool_slug: params.tool_slug, arguments: params.arguments },
          error: null,
          log_id: 'log_posthog_cached',
        }),
      },
    })
  )('[Given] cached auth configs [Then] execute seeds the session from cache', it => {
    it.scoped('uses cached auth_configs for consumer execute sessions', () =>
      Effect.gen(function* () {
        vi.spyOn(
          consumerShortTermCache,
          'getFreshConsumerToolRouterAuthConfigsFromCache'
        ).mockReturnValue(
          Effect.succeed(
            Option.some({
              authConfigs: {
                posthog: 'ac_posthog_cached',
              },
            })
          )
        );

        yield* cli([
          'execute',
          'POSTHOG_RUN_ENDPOINT',
          '--skip-checks',
          '-d',
          '{"project_id":"196278","name":"test"}',
        ]);

        expect(recordedSessionCreateParams).toHaveLength(1);
        expect(recordedSessionCreateParams[0]?.auth_configs).toEqual({
          posthog: 'ac_posthog_cached',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Upload Slack File',
            slug: 'SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK',
            description: 'Uploads a file to Slack',
            tags: ['slack'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                channels: { type: 'string' },
                file: {
                  type: 'object',
                  file_uploadable: true,
                  title: 'File',
                  description: 'Local file accepted by CLI',
                  properties: {
                    name: { type: 'string' },
                    mimetype: { type: 'string' },
                    s3key: { type: 'string' },
                  },
                  required: ['name', 'mimetype', 's3key'],
                },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )('[Given] file_uploadable schema [Then] execute --get-schema shows a path string input', it => {
    it.scoped('renders the CLI-facing schema instead of the raw FileUploadable object', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK', '--get-schema']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines) as unknown as {
          inputSchema: Record<string, unknown>;
        };

        expect(output.inputSchema).toEqual({
          type: 'object',
          properties: {
            channels: { type: 'string' },
            file: {
              title: 'File',
              description: 'Local file accepted by CLI',
              format: 'path',
              type: 'string',
              file_uploadable: true,
            },
          },
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260115_00', '20260101_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
        detailedToolkits: [
          {
            name: 'Gmail',
            slug: 'gmail',
            is_local_toolkit: false,
            composio_managed_auth_schemes: ['OAUTH2'],
            no_auth: false,
            meta: {
              description: 'Email service',
              categories: [],
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
              available_versions: ['20260115_00', '20260101_00'],
              tools_count: 36,
              triggers_count: 2,
            },
            auth_config_details: [],
          },
        ] satisfies ToolkitDetailed[],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] a cache miss [Then] the stored schema file includes the latest available version',
    it => {
      it.scoped('writes version metadata at the top of the cache file', () =>
        Effect.gen(function* () {
          const definition = yield* getOrFetchToolInputDefinition('GMAIL_SEND_EMAIL');
          const raw = fs.readFileSync(definition.schemaPath, 'utf8');
          const parsed = JSON.parse(raw) as {
            version: string | null;
            inputSchema: Record<string, unknown>;
          };

          expect(parsed.version).toBe('20260115_00');
          expect(parsed.inputSchema).toEqual({
            type: 'object',
            properties: {
              recipient_email: { type: 'string' },
            },
          });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['00000000_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
        detailedToolkits: [
          {
            name: 'Gmail',
            slug: 'gmail',
            is_local_toolkit: false,
            composio_managed_auth_schemes: ['OAUTH2'],
            no_auth: false,
            meta: {
              description: 'Email service',
              categories: [],
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
              available_versions: ['20260316_00'],
              tools_count: 36,
              triggers_count: 2,
            },
            auth_config_details: [],
          },
        ] satisfies ToolkitDetailed[],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] a placeholder tool version [Then] it stores the toolkit latest version instead',
    it => {
      it.scoped('prefers toolkit latest version over 00000000_00', () =>
        Effect.gen(function* () {
          const definition = yield* getOrFetchToolInputDefinition('GMAIL_SEND_EMAIL');
          const raw = fs.readFileSync(definition.schemaPath, 'utf8');
          const parsed = JSON.parse(raw) as {
            version: string | null;
            inputSchema: Record<string, unknown>;
          };

          expect(parsed.version).toBe(null);
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {
            ok: true,
          },
          error: null,
          successful: true,
          logId: 'log_stale_cache',
        },
      },
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260115_00', '20260101_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
                subject: { type: 'string' },
                body: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
        detailedToolkits: [
          {
            name: 'Gmail',
            slug: 'gmail',
            is_local_toolkit: false,
            composio_managed_auth_schemes: ['OAUTH2'],
            no_auth: false,
            meta: {
              description: 'Email service',
              categories: [],
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
              available_versions: ['20260115_00', '20260101_00'],
              tools_count: 36,
              triggers_count: 2,
            },
            auth_config_details: [],
          },
        ] satisfies ToolkitDetailed[],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] a stale cached schema [Then] it does not block execution and refreshes the cache',
    it => {
      it.scoped('uses tool execution instead of stale validation failure', () =>
        Effect.gen(function* () {
          const cacheDir = yield* setupCacheDir;
          const schemaPath = `${cacheDir}/tool_definitions/GMAIL_SEND_EMAIL.json`;
          fs.mkdirSync(`${cacheDir}/tool_definitions`, { recursive: true });
          fs.writeFileSync(
            schemaPath,
            JSON.stringify({
              version: '20260101_00',
              inputSchema: {
                type: 'object',
                properties: {
                  to: { type: 'string' },
                },
              },
            }),
            'utf8'
          );

          yield* cli([
            'execute',
            'GMAIL_SEND_EMAIL',
            '-d',
            '{"recipient_email":"karan@composio.dev","subject":"Hi","body":"Hello"}',
          ]);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);
          expect(output.successful).toBe(true);
          expect(output.logId).toBe('log_stale_cache');

          const refreshed = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
            version: string | null;
            inputSchema: Record<string, unknown>;
          };
          expect(['20260101_00', '20260115_00']).toContain(refreshed.version);
          expect(refreshed.inputSchema.type).toBe('object');
          const propertyKeys = Object.keys(
            (refreshed.inputSchema.properties ?? {}) as Record<string, unknown>
          );
          expect(propertyKeys.some(key => key === 'recipient_email' || key === 'to')).toBe(true);
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260101_00'],
            input_parameters: {
              type: 'object',
              required: ['recipient'],
              properties: {
                recipient: { type: 'string', description: 'Recipient email' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )('[Given] invalid tool input [Then] it fails fast with the cached schema path', it => {
    it.scoped('prints validation issues and writes the schema to tool_definitions', () =>
      Effect.gen(function* () {
        const cacheDir = yield* setupCacheDir;
        const schemaPath = `${cacheDir}/tool_definitions/GMAIL_SEND_EMAIL.json`;
        fs.mkdirSync(`${cacheDir}/tool_definitions`, { recursive: true });
        fs.writeFileSync(
          schemaPath,
          JSON.stringify({
            version: '20260101_00',
            inputSchema: {
              type: 'object',
              required: ['recipient_email'],
              properties: {
                recipient_email: { type: 'string', description: 'Recipient email' },
                subject: { type: 'string' },
                body: { type: 'string' },
              },
            },
          }),
          'utf8'
        );

        const failure = yield* cli([
          'execute',
          'GMAIL_SEND_EMAIL',
          '--dry-run',
          '-d',
          '{"recipient":42}',
        ]).pipe(
          Effect.flip,
          Effect.map(error => (error instanceof Error ? error.message : String(error)))
        );

        expect(failure).toContain('Input validation failed for GMAIL_SEND_EMAIL');
        expect(failure).toContain(schemaPath);
        expect(failure).toContain('Unknown key "recipient"');
        expect(failure).toContain('Use "recipient_email" instead.');
        expect(failure).toContain('Allowed top-level keys: recipient_email, subject, body');
        expect(fs.existsSync(schemaPath)).toBe(true);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {
            content: 'token '.repeat(20_000),
          },
          error: null,
          successful: true,
          logId: 'log_large_output',
        },
      },
    })
  )('[Given] a large execution response [Then] it stores the payload in a temp file', it => {
    it.scoped('returns a file reference instead of the full inline payload', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines) as unknown as {
          successful: boolean;
          error: string | null;
          logId: string;
          storedInFile: boolean;
          tokenCount: number;
          outputFilePath: string;
        };

        expect(output.successful).toBe(true);
        expect(output.storedInFile).toBe(true);
        expect(output.logId).toBe('log_large_output');
        expect(output.tokenCount).toBeGreaterThan(10_000);
        expect(output.outputFilePath).toMatch(
          /composio\/[^/]+\/GMAIL_SEND_EMAIL_OUTPUT_[^.]+\.json$/
        );
        expect(fs.existsSync(output.outputFilePath)).toBe(true);
        const storedJson = fs.readFileSync(output.outputFilePath, 'utf8');
        expect(storedJson).toContain('token token token');

        fs.rmSync(output.outputFilePath.slice(0, output.outputFilePath.lastIndexOf('/')), {
          recursive: true,
          force: true,
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] composio execute [Then] it works for the consumer flow', it => {
    it.scoped('root execute works for consumer flow without developer-only flags', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);

        expect(output.successful).toBe(true);
        expect(output.data.tool_slug).toBe('GMAIL_SEND_EMAIL');
        expect(output.data.arguments).toEqual({ recipient: 'a' });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] composio execute --parallel [Then] it executes repeated slug/data groups', it => {
    it.scoped('aggregates results from multiple tool calls', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          '--parallel',
          '--skip-checks',
          'GMAIL_SEND_EMAIL',
          '-d',
          '{"recipient":"a"}',
          'GITHUB_CREATE_ISSUE',
          '-d',
          '{"title":"Bug"}',
        ]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines) as unknown as {
          successful: boolean;
          parallel: boolean;
          results: Array<{
            slug: string;
            successful: boolean;
            data?: Record<string, unknown>;
          }>;
        };

        expect(output.successful).toBe(true);
        expect(output.parallel).toBe(true);
        expect(output.results).toHaveLength(2);
        expect(output.results[0]).toMatchObject({
          slug: 'GMAIL_SEND_EMAIL',
          successful: true,
          data: {
            tool_slug: 'GMAIL_SEND_EMAIL',
            arguments: { recipient: 'a' },
          },
        });
        expect(output.results[1]).toMatchObject({
          slug: 'GITHUB_CREATE_ISSUE',
          successful: true,
          data: {
            tool_slug: 'GITHUB_CREATE_ISSUE',
            arguments: { title: 'Bug' },
          },
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
                body: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )('[Given] composio execute --dry-run [Then] it validates without executing the tool', it => {
    it.scoped('returns a dry-run summary instead of calling the tool', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_SEND_EMAIL',
          '--dry-run',
          '-d',
          '{ recipient_email: "a@b.com", body: "Hello" }',
        ]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines) as unknown as {
          successful: boolean;
          dryRun: boolean;
          slug: string;
          schemaPath: string;
          schemaVersion: string | null;
          arguments: Record<string, unknown>;
        };

        expect(output.successful).toBe(true);
        expect(output.dryRun).toBe(true);
        expect(output.slug).toBe('GMAIL_SEND_EMAIL');
        expect(output.schemaVersion).toBeTruthy();
        expect(output.arguments).toEqual({ recipient_email: 'a@b.com', body: 'Hello' });
        expect(output.schemaPath).toContain('/tool_definitions/GMAIL_SEND_EMAIL.json');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email with attachment',
            tags: ['email'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
                attachment: {
                  file_uploadable: true,
                  title: 'Attachment',
                  description: 'Local path or URL to upload',
                },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] file_uploadable input as a local path [Then] execute uploads and sends s3key data',
    it => {
      it.scoped('uploads local file paths before Tool Router execution', () =>
        Effect.gen(function* () {
          const tempFile = path.join(os.tmpdir(), `composio-upload-${Date.now()}.txt`);
          fs.writeFileSync(tempFile, 'hello from cli upload', 'utf8');

          const originalFetch = globalThis.fetch;
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            if (url === 'https://s3.test.composio.dev/upload') {
              return Promise.resolve(new Response(null, { status: 200 }));
            }
            return originalFetch(input, init);
          });

          yield* cli([
            'execute',
            'GMAIL_SEND_EMAIL',
            '-d',
            JSON.stringify({
              recipient_email: 'a@b.com',
              attachment: tempFile,
            }),
          ]);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);

          expect(output.successful).toBe(true);
          expect(output.data.arguments).toEqual({
            recipient_email: 'a@b.com',
            attachment: {
              name: path.basename(tempFile),
              mimetype: 'application/octet-stream',
              s3key: `uploads/${path.basename(tempFile)}`,
            },
          });
          expect(fetchSpy).toHaveBeenCalledWith(
            'https://s3.test.composio.dev/upload',
            expect.objectContaining({
              method: 'PUT',
              headers: expect.objectContaining({
                'Content-Type': 'application/octet-stream',
              }),
            })
          );

          fs.rmSync(tempFile, { force: true });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Upload Slack File',
            slug: 'SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK',
            description: 'Uploads a file to Slack',
            tags: ['slack'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                channels: { type: 'string' },
                file: {
                  type: 'object',
                  file_uploadable: true,
                  title: 'File',
                  description: 'Local file accepted by CLI',
                  properties: {
                    name: { type: 'string' },
                    mimetype: { type: 'string' },
                    s3key: { type: 'string' },
                  },
                  required: ['name', 'mimetype', 's3key'],
                },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] --file for a tool with one file_uploadable input [Then] execute injects it automatically',
    it => {
      it.scoped('injects into the single file_uploadable field before upload hydration', () =>
        Effect.gen(function* () {
          const tempFile = path.join(os.tmpdir(), `composio-inject-${Date.now()}.png`);
          fs.writeFileSync(tempFile, 'png-binary-ish', 'utf8');

          const originalFetch = globalThis.fetch;
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            if (url === 'https://s3.test.composio.dev/upload') {
              return Promise.resolve(new Response(null, { status: 200 }));
            }
            return originalFetch(input, init);
          });

          yield* cli([
            'execute',
            'SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK',
            '--skip-connection-check',
            '--file',
            tempFile,
            '-d',
            JSON.stringify({ channels: 'C123' }),
          ]);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);

          expect(output.successful).toBe(true);
          expect(output.data.arguments).toEqual({
            channels: 'C123',
            file: {
              name: path.basename(tempFile),
              mimetype: 'application/octet-stream',
              s3key: `uploads/${path.basename(tempFile)}`,
            },
          });
          expect(fetchSpy).toHaveBeenCalled();

          fs.rmSync(tempFile, { force: true });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Nested Upload',
            slug: 'NESTED_UPLOAD_TOOL',
            description: 'Uploads a nested file',
            tags: ['test'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                payload: {
                  properties: {
                    file: {
                      file_uploadable: true,
                      title: 'File',
                      description: 'Nested file path',
                      properties: {
                        name: { type: 'string' },
                        mimetype: { type: 'string' },
                        s3key: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] a nested file_uploadable path under properties without explicit object type [Then] hydration still uploads it',
    it => {
      it.scoped('treats property-bearing schema nodes as object-like during upload hydration', () =>
        Effect.gen(function* () {
          const tempFile = path.join(os.tmpdir(), `composio-nested-${Date.now()}.png`);
          fs.writeFileSync(tempFile, 'nested-png-binary-ish', 'utf8');

          const originalFetch = globalThis.fetch;
          vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            if (url === 'https://s3.test.composio.dev/upload') {
              return Promise.resolve(new Response(null, { status: 200 }));
            }
            return originalFetch(input, init);
          });

          yield* cli([
            'execute',
            'NESTED_UPLOAD_TOOL',
            '--skip-connection-check',
            '--file',
            tempFile,
            '-d',
            JSON.stringify({ payload: {} }),
          ]);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);

          expect(output.successful).toBe(true);
          expect(output.data.arguments).toEqual({
            payload: {
              file: {
                name: path.basename(tempFile),
                mimetype: 'application/octet-stream',
                s3key: `uploads/${path.basename(tempFile)}`,
              },
            },
          });

          fs.rmSync(tempFile, { force: true });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email with attachment',
            tags: ['email'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
                attachment: {
                  file_uploadable: true,
                  title: 'Attachment',
                  description: 'Local path or URL to upload',
                  properties: {
                    name: { type: 'string' },
                    mimetype: { type: 'string' },
                    s3key: { type: 'string' },
                  },
                },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] an S3 upload failure [Then] execute surfaces the upload error instead of sending a raw path',
    it => {
      it.scoped('propagates upload failures from file hydration', () =>
        Effect.gen(function* () {
          const tempFile = path.join(os.tmpdir(), `composio-upload-fail-${Date.now()}.txt`);
          fs.writeFileSync(tempFile, 'hello from failed cli upload', 'utf8');

          const originalFetch = globalThis.fetch;
          vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            if (url === 'https://s3.test.composio.dev/upload') {
              return Promise.resolve(
                new Response('Upload failed', { status: 500, statusText: 'Upload Failed' })
              );
            }
            return originalFetch(input, init);
          });

          const failure = yield* cli([
            'execute',
            'GMAIL_SEND_EMAIL',
            '--skip-connection-check',
            '-d',
            JSON.stringify({
              recipient_email: 'a@b.com',
              attachment: tempFile,
            }),
          ]).pipe(
            Effect.flip,
            Effect.map(error => (error instanceof Error ? error.message : String(error)))
          );

          expect(failure).toContain('Failed to upload file to S3');

          fs.rmSync(tempFile, { force: true });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )('[Given] --file for a tool with no file_uploadable input [Then] execute fails clearly', it => {
    it.scoped('rejects the convenience flag when the schema has no file input', () =>
      Effect.gen(function* () {
        const failure = yield* cli([
          'execute',
          'GMAIL_SEND_EMAIL',
          '--file',
          '/tmp/example.txt',
        ]).pipe(
          Effect.flip,
          Effect.map(error => (error instanceof Error ? error.message : String(error)))
        );

        expect(failure).toContain('has no file_uploadable input');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Multi Upload',
            slug: 'MULTI_UPLOAD_TOOL',
            description: 'Tool with two uploadable fields',
            tags: ['test'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                avatar: {
                  type: 'object',
                  file_uploadable: true,
                  properties: {
                    name: { type: 'string' },
                    mimetype: { type: 'string' },
                    s3key: { type: 'string' },
                  },
                },
                resume: {
                  type: 'object',
                  file_uploadable: true,
                  properties: {
                    name: { type: 'string' },
                    mimetype: { type: 'string' },
                    s3key: { type: 'string' },
                  },
                },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )(
    '[Given] --file for a tool with multiple file_uploadable inputs [Then] execute asks for explicit JSON',
    it => {
      it.scoped('fails instead of guessing which file field to use', () =>
        Effect.gen(function* () {
          const failure = yield* cli([
            'execute',
            'MULTI_UPLOAD_TOOL',
            '--file',
            '/tmp/example.txt',
          ]).pipe(
            Effect.flip,
            Effect.map(error => (error instanceof Error ? error.message : String(error)))
          );

          expect(failure).toContain('has multiple file_uploadable inputs');
          expect(failure).toContain('avatar');
          expect(failure).toContain('resume');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                recipient_email: { type: 'string' },
                body: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
        detailedToolkits: [
          {
            name: 'Gmail',
            slug: 'gmail',
            is_local_toolkit: false,
            composio_managed_auth_schemes: ['OAUTH2'],
            no_auth: false,
            meta: {
              description: 'Email service',
              categories: [],
              created_at: new Date('2024-05-03T11:44:32.061Z') as any,
              updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
              available_versions: ['20260316_00'],
              tools_count: 36,
              triggers_count: 2,
            },
            auth_config_details: [],
          },
        ] satisfies ToolkitDetailed[],
      } satisfies TestLiveInput['toolkitsData'],
    })
  )('[Given] composio execute --get-schema [Then] it caches and prints the input schema', it => {
    it.scoped('fetches schema without executing the tool', () =>
      Effect.gen(function* () {
        const cacheDir = yield* setupCacheDir;
        const schemaPath = `${cacheDir}/tool_definitions/GMAIL_SEND_EMAIL.json`;

        yield* cli(['execute', 'GMAIL_SEND_EMAIL', '--get-schema']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines) as unknown as {
          slug: string;
          version: string | null;
          schemaPath: string;
          inputSchema: Record<string, unknown>;
        };

        expect(output.slug).toBe('GMAIL_SEND_EMAIL');
        expect(output.version).toBe('20260316_00');
        expect(output.schemaPath).toBe(schemaPath);
        expect(output.inputSchema).toEqual({
          type: 'object',
          properties: {
            recipient_email: { type: 'string' },
            body: { type: 'string' },
          },
        });
        expect(fs.existsSync(schemaPath)).toBe(true);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'user-config-with-global-context',
      stdin: { isTTY: true, data: '' },
      toolkitsData: {
        tools: [
          {
            name: 'Create Issue',
            slug: 'GITHUB_CREATE_AN_ISSUE',
            description: 'Create a GitHub issue',
            tags: ['github'],
            available_versions: ['20260316_00'],
            input_parameters: {
              type: 'object',
              properties: {
                owner: { type: 'string' },
                repo: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                html_url: { type: 'string' },
              },
            },
          },
        ],
      },
    })
  )(
    '[Given] composio execute --get-schema without a configured test user id [Then] it still works',
    it => {
      it.scoped('does not require execution user context for schema fetches', () =>
        Effect.gen(function* () {
          const cacheDir = yield* setupCacheDir;
          const schemaPath = `${cacheDir}/tool_definitions/GITHUB_CREATE_AN_ISSUE.json`;

          yield* cli(['execute', 'GITHUB_CREATE_AN_ISSUE', '--get-schema']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines) as unknown as {
            slug: string;
            version: string | null;
            schemaPath: string;
            inputSchema: Record<string, unknown>;
          };

          expect(output.slug).toBe('GITHUB_CREATE_AN_ISSUE');
          expect(output.version).toBe('20260316_00');
          expect(output.schemaPath).toBe(schemaPath);
          expect(output.inputSchema).toEqual({
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' },
            },
          });
          expect(fs.existsSync(schemaPath)).toBe(true);
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )(
    '[Given] composio execute with a JS-style object literal [Then] it parses and executes successfully',
    it => {
      it.scoped('accepts object literal syntax for -d input', () =>
        Effect.gen(function* () {
          yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{ recipient: "a", subject: "Hello" }']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);

          expect(output.successful).toBe(true);
          expect(output.data.tool_slug).toBe('GMAIL_SEND_EMAIL');
          expect(output.data.arguments).toEqual({ recipient: 'a', subject: 'Hello' });
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] composio execute --perf-debug [Then] it is accepted on the root command', it => {
    it.scoped('parses and executes with perf debug enabled', () =>
      Effect.gen(function* () {
        yield* cli(['execute', '--perf-debug', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);

        expect(output.successful).toBe(true);
        expect(output.data.tool_slug).toBe('GMAIL_SEND_EMAIL');
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            delete process.env.COMPOSIO_PERF_DEBUG;
          })
        )
      )
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )(
    '[Given] no --user-id and no project test_user_id [Then] falls back to global test_user_id',
    it => {
      it.scoped('executes without printing global test user diagnostics', () =>
        Effect.gen(function* () {
          yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines);
          const text = lines.join('\n');

          expect(output.successful).toBe(true);
          expect(output.data.tool_slug).toBe('GMAIL_SEND_EMAIL');
          expect(text).not.toContain('Using global test user id');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260101_00'],
            input_parameters: {
              type: 'object',
              required: ['recipient'],
              properties: {
                recipient: { type: 'string', description: 'Recipient email' },
                subject: { type: 'string', description: 'Subject line' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] execute-help helper [Then] prints input parameters only', it => {
    it.scoped('prints execute input schema help for the provided slug', () =>
      Effect.gen(function* () {
        yield* showToolsExecuteInputHelp('GMAIL_SEND_EMAIL');
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Data Parameters:');
        expect(output).toContain('recipient');
        expect(output).toContain('subject');
        expect(output).not.toContain('Output Parameters:');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: {
        tools: [
          {
            name: 'Send Email',
            slug: 'GMAIL_SEND_EMAIL',
            description: 'Send an email',
            tags: ['email'],
            available_versions: ['20260101_00'],
            input_parameters: {
              type: 'object',
              required: ['recipient'],
              properties: {
                recipient: { type: 'string', description: 'Recipient email' },
                subject: { type: 'string', description: 'Subject line' },
              },
            },
            output_parameters: {
              type: 'object',
              properties: {
                message_id: { type: 'string' },
              },
            },
          },
        ],
      } satisfies TestLiveInput['toolkitsData'],
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] execute --help with a slug [Then] it shows command help', it => {
    it.scoped('shows the root execute help text', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GMAIL_SEND_EMAIL', '--help']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('USAGE');
        expect(output).toContain(
          'composio execute <slug> [-d, --data text] [--file path] [--dry-run] [--get-schema] [--parallel]'
        );
        expect(output).toContain('composio execute GMAIL_SEND_EMAIL --get-schema');
        expect(output).toContain('--parallel');
        expect(output).toContain('GITHUB_CREATE_AN_ISSUE');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: false, data: '{"owner":"composio"}' },
    })
  )('[Given] stdin is piped [Then] reads input from stdin', it => {
    it.scoped('reads stdin input', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GITHUB_GET_REPOS']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);

        expect(output.successful).toBe(true);
        expect(output.data.tool_slug).toBe('GITHUB_GET_REPOS');
        expect(output.data.arguments).toEqual({ owner: 'composio' });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: new ComposioNoActiveConnectionError({
          details: {
            slug: 'ActionExecute_ConnectedAccountNotFound',
            message: 'No connected account found for entity ID default for toolkit gmail',
          },
          toolSlug: 'GMAIL_CREATE_EMAIL_DRAFT',
        }),
      },
    })
  )('[Given] connected account not found slug (legacy) [Then] prints tips', it => {
    it.scoped('prints connected account tips for legacy slug', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Run `composio link gmail`, then retry.');
        expect(output).toContain('Tips');
        expect(output).toContain('composio link gmail');
        expect(output).not.toContain('COMPOSIO_MANAGE_CONNECTIONS');
      })
    );
  });

  // --- Tool Router error path (flows through real ToolsExecutorLive) ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolRouter: {
        execute: async () => {
          throw Object.assign(new Error("No active connection found for toolkit(s) 'gmail'"), {
            error: {
              message: "No active connection found for toolkit(s) 'gmail' in this session",
              code: 4302,
              slug: 'ToolRouterV2_NoActiveConnection',
              status: 400,
              request_id: 'test-request-id',
            },
          });
        },
      },
    })
  )('[Given] Tool Router NoActiveConnection error [Then] prints connection tips', it => {
    it.scoped('prints connection tips with toolkit name derived from tool slug', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{"recipient":"to@example.com"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Run `composio link gmail`, then retry.');
        expect(output).toContain('Tips');
        expect(output).toContain('composio link gmail');
        expect(output).not.toContain('COMPOSIO_MANAGE_CONNECTIONS');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolRouter: {
        execute: async (_sessionId, params) => ({
          data: { tool_slug: params.tool_slug, custom: 'response' },
          error: null,
          log_id: 'log_custom',
        }),
      },
    })
  )('[Given] custom Tool Router execute mock [Then] returns custom response', it => {
    it.scoped('flows through real ToolsExecutorLive with custom mock', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GITHUB_STAR_REPO', '-d', '{"owner":"composio","repo":"composio"}']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);

        expect(output.successful).toBe(true);
        expect(output.data.tool_slug).toBe('GITHUB_STAR_REPO');
        expect(output.data.custom).toBe('response');
        expect(output.logId).toBe('log_custom');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: {
          error: {
            message: 'Error executing the tool GMAIL_CREATE_EMAIL_DRAFT',
          },
        },
      },
    })
  )('[Given] executor throws wrapped error [Then] prints actionable message', it => {
    it.scoped('prints actionable error details', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Error executing the tool GMAIL_CREATE_EMAIL_DRAFT');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: { error: { message: 'API error: invalid input' } },
      },
    })
  )('[Given] executor throws object error [Then] prints message and details', it => {
    it.scoped('prints object error message and details', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('API error: invalid input');
        expect(output).toContain('Error details');
      })
    );
  });

  // --- Soft failure tests (API returns { successful: false }) ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {},
          error:
            "Invalid request data provided\n- Following fields are missing: {'recipient_email'}",
          successful: false,
          logId: 'log_test123',
        },
      },
    })
  )('[Given] tool returns soft failure with logId [Then] shows error and logId', it => {
    it.scoped('shows error and logId for soft failure', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        // Spinner should error, not succeed — no success message for the spinner
        expect(output).not.toContain('Executing tool');
        // Error message and logId should appear
        expect(output).toContain('Execution failed');
        expect(output).toContain('log_test123');
        expect(output).toContain('Invalid request data provided');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {},
          error: 'Tool execution failed',
          successful: false,
          logId: '',
        },
      },
    })
  )('[Given] tool returns soft failure without logId [Then] shows error without logId', it => {
    it.scoped('shows error without logId for soft failure', () =>
      Effect.gen(function* () {
        yield* cli([
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        // Spinner should error, not succeed
        expect(output).not.toContain('Executing tool');
        expect(output).toContain('Execution failed');
        expect(output).toContain('Tool execution failed');
        // logId is empty, so the spinner line should not show "(logId: ...)"
        expect(output).not.toContain('(logId:');
      })
    );
  });

  // --- Meta tool error tests ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: new ComposioNoActiveConnectionError({
          details: {
            slug: 'ToolRouterV2_NoActiveConnection',
            message: 'No active connection found for toolkit(s) in this session',
          },
          toolSlug: 'COMPOSIO_SEARCH_TOOLS',
        }),
      },
    })
  )('[Given] meta tool NoActiveConnection error [Then] does not suggest "link composio"', it => {
    it.scoped('omits connection tips for meta tool slugs', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'COMPOSIO_SEARCH_TOOLS', '-d', '{"query":"email"}']).pipe(
          Effect.catchAll(() => Effect.void)
        );
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Link the required toolkit/app, then retry.');
        // Should NOT produce a misleading tip like "link composio"
        expect(output).not.toContain('link composio');
        expect(output).not.toContain('COMPOSIO_MANAGE_CONNECTIONS');
      })
    );
  });

  // --- Edge case tests ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d with invalid JSON [Then] fails with parse error', it => {
    it.scoped('fails with invalid JSON error', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', 'not-valid-json']).pipe(
          Effect.flip,
          Effect.map(error => (error instanceof Error ? error.message : String(error)))
        );
        expect(failure).toContain('Invalid JSON input');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d with JSON array [Then] fails with expected-object error', it => {
    it.scoped('fails with expected object error', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '[1,2,3]']).pipe(
          Effect.flip,
          Effect.map(error => (error instanceof Error ? error.message : String(error)))
        );
        expect(failure).toContain('Expected a JSON object');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d with JSON string [Then] fails with expected-object error', it => {
    it.scoped('fails with expected object error for string', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '"just a string"']).pipe(
          Effect.flip,
          Effect.map(error => (error instanceof Error ? error.message : String(error)))
        );
        expect(failure).toContain('Expected a JSON object');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: { executed: true },
          error: null,
          successful: true,
          logId: 'log_test',
        },
      },
    })
  )('[Given] no -d and TTY stdin [Then] defaults to empty object and executes', it => {
    it.scoped('defaults to {} when no data provided', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GMAIL_SEND_EMAIL']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('successful');
        expect(output).toContain('executed');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: false, data: '' },
    })
  )('[Given] empty piped stdin [Then] fails with parse error', it => {
    it.scoped('fails with error for empty stdin', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['execute', 'GMAIL_SEND_EMAIL']).pipe(
          Effect.flip,
          Effect.map(error => (error instanceof Error ? error.message : String(error)))
        );
        expect(failure).toContain('Invalid JSON input');
      })
    );
  });

  // --- CI redaction tests ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {
            id: '19c8ab00a2e35870',
            labelIds: ['SENT'],
            threadId: '19c8ab00a2e35870',
          },
          error: null,
          successful: true,
          logId: 'log_uDPw0g_w8QCa',
        },
      },
    })
  )('[Given] CI redaction enabled [Then] redacts id-like fields and logId', it => {
    it.scoped('redacts id, threadId, logId but preserves labelIds', () =>
      Effect.gen(function* () {
        const spy = vi
          .spyOn(redactModule, 'redact')
          .mockImplementation(
            (({ prefix }: { value: string; prefix?: string }) =>
              `${prefix ?? ''}<REDACTED>`) as typeof redactModule.redact
          );

        try {
          yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient_email":"to@example.com"}']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines) as unknown as {
            data: { id: string; labelIds: string[]; threadId: string };
            logId: string;
            successful: boolean;
          };

          expect(output.data.id).toBe('<REDACTED>');
          expect(output.data.threadId).toBe('<REDACTED>');
          expect(output.data.labelIds).toEqual(['SENT']);
          expect(output.logId).toBe('log_<REDACTED>');
          expect(output.successful).toBe(true);
        } finally {
          spy.mockRestore();
        }
      })
    );
  });
});
