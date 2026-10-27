import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import type {
  SessionCreateParams,
  SessionSearchParams,
} from '@composio/client/resources/tool-router';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Tools } from 'src/models/tools';
import { CommandInputError } from 'src/commands/errors';
import { MissingActingUserError } from 'src/commands/surface';

const testTools: Tools = [
  {
    name: 'Send Email',
    slug: 'GMAIL_SEND_EMAIL',
    description: 'Sends an email to a recipient using Gmail',
    tags: ['messaging', 'email'],
    available_versions: ['20260101_00'],
    input_parameters: { type: 'object', properties: {} },
    output_parameters: { type: 'object', properties: {} },
  },
  {
    name: 'Send Message',
    slug: 'SLACK_SEND_MESSAGE',
    description: 'Sends a message to a Slack channel',
    tags: ['messaging'],
    available_versions: ['20260101_00'],
    input_parameters: { type: 'object', properties: {} },
    output_parameters: { type: 'object', properties: {} },
  },
  {
    name: 'Create Issue',
    slug: 'GITHUB_CREATE_ISSUE',
    description: 'Creates a new issue in a GitHub repository',
    tags: ['development'],
    available_versions: ['20260101_00'],
    input_parameters: { type: 'object', properties: {} },
    output_parameters: { type: 'object', properties: {} },
  },
];

const toolkitsData = {
  tools: testTools,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const testLiveOptions = {
  baseConfigProvider: testConfigProvider,
  toolkitsData,
  fixture: 'global-test-user-id' as const,
};

describe('CLI: composio search', () => {
  layer(TestLive(testLiveOptions))('[Given] a blank query [Then] typed validation fails', it => {
    it.effect('returns the structured missing-query error', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['search', '   ']).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(CommandInputError);
        expect(failure).toMatchObject({
          option: '<query>',
          message: 'At least one query is required.',
        });
      })
    );
  });

  layer(TestLive(testLiveOptions))('[Given] query "send" [Then] returns JSON by default', it => {
    it.effect('returns JSON payload by default', () =>
      Effect.gen(function* () {
        yield* cli(['search', 'send']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        const parsed = JSON.parse(String(lines.at(-1)));

        expect(parsed).toHaveProperty('results');
        expect(parsed).toHaveProperty('tool_schemas');
        expect(parsed).toHaveProperty('connected_toolkits');
        expect(parsed).toHaveProperty('next_steps');
        expect(parsed).not.toHaveProperty('session');
        expect(parsed).not.toHaveProperty('time_info');
        expect(parsed).not.toHaveProperty('next_steps_guidance');
        expect(parsed).not.toHaveProperty('success');
        expect(parsed).not.toHaveProperty('error');
        expect(output).toContain('GMAIL_SEND_EMAIL');
        expect(output).toContain('SLACK_SEND_MESSAGE');
        expect(output).toContain('~/.composio/tool_definitions/GMAIL_SEND_EMAIL.json');
      })
    );
  });

  const customSlug = 'CUSTOM_DEEPWIKI_READ_WIKI_CONTENTS';

  layer(
    TestLive({
      ...testLiveOptions,
      toolRouter: {
        search: (_sessionId, params) =>
          Effect.succeed({
            success: true,
            error: null,
            results: [
              {
                index: 1,
                use_case: params.queries[0]?.use_case ?? '',
                primary_tool_slugs: [customSlug],
                related_tool_slugs: [],
                toolkits: ['CUSTOM_DEEPWIKI'],
              },
            ],
            tool_schemas: {
              [customSlug]: {
                tool_slug: customSlug,
                toolkit: 'CUSTOM_DEEPWIKI',
                description: 'Read wiki contents',
                hasFullSchema: true,
                input_schema: {
                  type: 'object',
                  properties: { repo: { type: 'string' } },
                  required: ['repo'],
                },
                output_schema: { type: 'object', properties: {} },
              },
            },
            toolkit_connection_statuses: [],
            next_steps_guidance: [],
            session: {
              id: 'trs_test_session',
              generate_id: false,
              instructions: 'Reuse this session id for follow-up calls.',
            },
            time_info: {
              current_time_utc: '2026-01-01T00:00:00.000Z',
              current_time_utc_epoch_seconds: 1767225600,
              message: 'UTC time',
            },
          }),
      },
    })
  )('[Given] a remote custom tool schema [Then] search uses the Tool Router schema', it => {
    it.effect('does not refetch custom tool schemas through the legacy tools endpoint', () =>
      Effect.gen(function* () {
        yield* cli(['search', 'read wiki contents']);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain(customSlug);
        expect(output).toContain(`~/.composio/tool_definitions/${customSlug}.json`);
      })
    );
  });

  let schemaRequestSlugs: unknown;

  layer(
    TestLive({
      ...testLiveOptions,
      toolRouter: {
        search: (_sessionId, params) =>
          Effect.succeed({
            success: true,
            error: null,
            results: [
              {
                index: 1,
                use_case: params.queries[0]?.use_case ?? '',
                primary_tool_slugs: [customSlug],
                related_tool_slugs: [],
                toolkits: ['CUSTOM_DEEPWIKI'],
              },
            ],
            tool_schemas: {
              [customSlug]: {
                tool_slug: customSlug,
                toolkit: 'CUSTOM_DEEPWIKI',
                description: 'Read wiki contents',
                hasFullSchema: false,
                schemaRef: {
                  tool: 'COMPOSIO_GET_TOOL_SCHEMAS',
                  args: { tool_slugs: [customSlug] },
                },
              },
            },
            toolkit_connection_statuses: [],
            next_steps_guidance: [],
            session: {
              id: 'trs_test_session',
              generate_id: false,
              instructions: 'Reuse this session id for follow-up calls.',
            },
            time_info: {
              current_time_utc: '2026-01-01T00:00:00.000Z',
              current_time_utc_epoch_seconds: 1767225600,
              message: 'UTC time',
            },
          }),
        executeMeta: (_sessionId, params) =>
          Effect.sync(() => {
            schemaRequestSlugs = params.arguments?.tool_slugs;
            return {
              result_type: 'completed' as const,
              data: {
                success: true,
                tool_schemas: {
                  [customSlug]: {
                    tool_slug: customSlug,
                    toolkit: 'CUSTOM_DEEPWIKI',
                    description: 'Read wiki contents',
                    input_schema: {
                      type: 'object',
                      properties: { repo: { type: 'string' } },
                      required: ['repo'],
                    },
                  },
                },
              },
              error: null,
              log_id: 'log_test',
            };
          }),
      },
    })
  )(
    '[Given] a remote custom tool schema reference [Then] search resolves it with the Tool Router meta-tool',
    it => {
      it.effect('does not use the legacy tools endpoint for schema references', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'read wiki contents']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain(customSlug);
          expect(schemaRequestSlugs).toEqual([customSlug]);
          expect(output).toContain(`~/.composio/tool_definitions/${customSlug}.json`);
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] multiple queries [Then] the CLI returns a batched JSON response',
    it => {
      it.effect('returns batched results in JSON', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', 'create issue']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(JSON.parse(String(lines.at(-1)))).toMatchObject({
            results: [{ use_case: 'send' }, { use_case: 'create issue' }],
          });
          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('SLACK_SEND_MESSAGE');
          expect(output).toContain('GITHUB_CREATE_ISSUE');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] query with no results [Then] shows not found message',
    it => {
      it.effect('shows empty json output', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'nonexistent_query']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('[]');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] query "send" --toolkits "gmail" --human [Then] scopes to toolkit',
    it => {
      it.effect('scopes search to toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--toolkits', 'gmail', '--human']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).not.toContain('SLACK_SEND_MESSAGE');
          expect(output).not.toContain('"results"');
          expect(output).toContain('Found 1 tools');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] search --human [Then] it stays human-readable and omits raw JSON',
    it => {
      it.effect('does not print raw JSON in human mode', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--human']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).not.toContain('"results"');
          expect(output).not.toContain('"tool_schemas"');
          expect(output).toContain('Found 2 tools');
          expect(output).toContain('composio execute');
          expect(output).toContain('composio link <toolkit>');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] search --json [Then] JSON output includes full tool-router payload and next steps',
    it => {
      it.effect('prints full search response with next steps for jq', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--json']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const parsed = JSON.parse(String(lines.at(-1)));

          expect(parsed).toHaveProperty('results');
          expect(parsed).toHaveProperty('tool_schemas');
          expect(parsed).toHaveProperty('connected_toolkits');
          expect(parsed).toHaveProperty('next_steps');
          expect(parsed).not.toHaveProperty('session');
          expect(parsed).not.toHaveProperty('time_info');
          expect(parsed).not.toHaveProperty('next_steps_guidance');
          expect(parsed).not.toHaveProperty('success');
          expect(parsed).not.toHaveProperty('error');
          expect(output).toContain('"Execute a tool"');
          expect(output).toContain('"Link a user account"');
          expect(output).toContain('composio execute');
          expect(output).toContain('composio link gmail');
        })
      );
    }
  );

  layer(
    TestLive({
      ...testLiveOptions,
      toolRouter: {
        search: (_sessionId, params) =>
          Effect.succeed({
            success: true,
            error: null,
            results: [
              {
                index: 1,
                use_case: params.queries[0]?.use_case ?? '',
                primary_tool_slugs: ['GMAIL_SEND_EMAIL'],
                related_tool_slugs: [],
                toolkits: ['gmail'],
                reference_workbench_snippets: [{ description: 'snippet', code: 'print("hi")' }],
              },
            ],
            tool_schemas: {
              GMAIL_SEND_EMAIL: {
                tool_slug: 'GMAIL_SEND_EMAIL',
                toolkit: 'gmail',
                description: 'Sends an email',
                hasFullSchema: true,
                input_schema: { type: 'object', properties: {} },
                output_schema: { type: 'object', properties: {} },
              },
            },
            toolkit_connection_statuses: [
              {
                toolkit: 'gmail',
                description: 'gmail toolkit',
                has_active_connection: false,
                status_message: 'No active connection',
              },
            ],
            next_steps_guidance: [],
            session: {
              id: 'trs_test_session',
              generate_id: false,
              instructions: 'Reuse this session id for follow-up calls.',
            },
            time_info: {
              current_time_utc: '2026-01-01T00:00:00.000Z',
              current_time_utc_epoch_seconds: 1767225600,
              message: 'UTC time',
            },
          }),
      },
    })
  )(
    '[Given] search results with workbench snippets [Then] snippets are removed from JSON output',
    it => {
      it.effect('omits workbench snippets and emits schema/cache references', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).not.toContain('reference_workbench_snippets');
          expect(output).toContain('~/.composio/tool_definitions/GMAIL_SEND_EMAIL.json');
          expect(output).toContain('"related_tools_path_format"');
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
            description: 'Sends an email',
            tags: [],
            available_versions: [],
            input_parameters: {
              type: 'object',
              properties: {
                to: { type: 'string' },
                subject: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['to'],
            },
            output_parameters: { type: 'object', properties: {} },
          },
        ],
      },
    })
  )(
    '[Given] search with schema properties [Then] next steps have valid payload and lowercase link',
    it => {
      it.effect('next steps use valid payload from input_schema and lowercase toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const parsed = JSON.parse(String(lines.at(-1)));

          expect(parsed.next_steps.steps).toEqual(
            expect.arrayContaining([
              {
                action: 'Execute a tool',
                command: expect.stringMatching(
                  /composio execute "GMAIL_SEND_EMAIL".*-d '\{"to":"","subject":"","body":""\}'/
                ),
              },
              { action: 'Link a user account', command: 'composio link gmail' },
            ])
          );
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] search with empty schema [Then] next steps execute uses -d "{}"',
    it => {
      it.effect('next steps use -d "{}" when no schema properties', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const parsed = JSON.parse(String(lines.at(-1)));

          expect(parsed.next_steps.steps).toEqual(
            expect.arrayContaining([
              { action: 'Execute a tool', command: expect.stringContaining('-d "{}"') },
            ])
          );
        })
      );
    }
  );

  {
    let createParams: SessionCreateParams | undefined;
    let searchParams: SessionSearchParams | undefined;

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        toolkitsData,
        fixture: 'global-test-user-id',
        toolRouter: {
          create: params =>
            Effect.sync(() => {
              createParams = params;
              return {
                session_id: 'trs_test_session',
                config: {
                  user_id: params.user_id,
                  execute: {},
                  search: {},
                  preload: { tools: [] },
                  instant: false,
                },
                config_version: 1,
                mcp: { type: 'http', url: 'https://mcp.test.composio.dev' },
                tool_router_tools: ['COMPOSIO_SEARCH_TOOLS'],
              };
            }),
          search: (_sessionId, params) =>
            Effect.sync(() => {
              searchParams = params;
              return {
                success: true,
                error: null,
                results: [
                  {
                    index: 1,
                    use_case: params.queries[0]?.use_case ?? '',
                    primary_tool_slugs: ['GMAIL_SEND_EMAIL'],
                    related_tool_slugs: [],
                    toolkits: ['gmail'],
                  },
                ],
                tool_schemas: {
                  GMAIL_SEND_EMAIL: {
                    tool_slug: 'GMAIL_SEND_EMAIL',
                    toolkit: 'gmail',
                    description: 'Sends an email',
                    hasFullSchema: true,
                    input_schema: { type: 'object', properties: {} },
                    output_schema: { type: 'object', properties: {} },
                  },
                },
                toolkit_connection_statuses: [
                  {
                    toolkit: 'gmail',
                    description: 'gmail toolkit',
                    has_active_connection: false,
                    status_message: 'No active connection',
                  },
                ],
                next_steps_guidance: [],
                session: {
                  id: 'trs_test_session',
                  generate_id: false,
                  instructions: 'Reuse this session id for follow-up calls.',
                },
                time_info: {
                  current_time_utc: '2026-01-01T00:00:00.000Z',
                  current_time_utc_epoch_seconds: 1767225600,
                  message: 'UTC time',
                },
              };
            }),
        },
      })
    )('[Given] --toolkits filter [Then] it is passed to session create as enabled toolkits', it => {
      it.effect('passes toolkit filter into tool router session', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--toolkits', 'gmail,outlook']);

          expect(createParams?.toolkits).toEqual({ enable: ['gmail', 'outlook'] });
          expect(createParams?.experimental).toBeUndefined();
          expect(searchParams?.queries[0]?.use_case).toBe('send');
        })
      );
    });
  }

  {
    let createParams: SessionCreateParams | undefined;

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        toolkitsData,
        fixture: 'global-test-user-id',
        toolRouter: {
          create: params =>
            Effect.sync(() => {
              createParams = params;
              return {
                session_id: 'trs_test_session',
                config: {
                  user_id: params.user_id,
                  execute: {},
                  search: {},
                  preload: { tools: [] },
                  instant: false,
                },
                config_version: 1,
                mcp: { type: 'http', url: 'https://mcp.test.composio.dev' },
                tool_router_tools: ['COMPOSIO_SEARCH_TOOLS'],
              };
            }),
        },
      })
    )(
      '[Given] unknown local-style toolkit filter [Then] it is still sent as a remote toolkit',
      it => {
        it.effect(
          'does not inject experimental custom toolkits for unknown local-style names',
          () =>
            Effect.gen(function* () {
              yield* cli(['search', 'inspect local app', '--toolkits', 'local_app']);

              expect(createParams?.toolkits).toEqual({ enable: ['local_app'] });
              expect(createParams?.experimental).toBeUndefined();
            })
        );
      }
    );
  }

  {
    let searchParams: SessionSearchParams | undefined;

    layer(
      TestLive({
        baseConfigProvider: testConfigProvider,
        toolkitsData,
        fixture: 'global-test-user-id',
        toolRouter: {
          search: (_sessionId, params) =>
            Effect.sync(() => {
              searchParams = params;
              return {
                success: true,
                error: null,
                results: params.queries.map((query, index) => ({
                  index: index + 1,
                  use_case: query.use_case ?? '',
                  primary_tool_slugs:
                    query.use_case === 'create issue'
                      ? ['GITHUB_CREATE_ISSUE']
                      : ['GMAIL_SEND_EMAIL'],
                  related_tool_slugs: [],
                  toolkits: query.use_case === 'create issue' ? ['github'] : ['gmail'],
                })),
                tool_schemas: {
                  GMAIL_SEND_EMAIL: {
                    tool_slug: 'GMAIL_SEND_EMAIL',
                    toolkit: 'gmail',
                    description: 'Sends an email',
                    hasFullSchema: true,
                    input_schema: { type: 'object', properties: {} },
                    output_schema: { type: 'object', properties: {} },
                  },
                  GITHUB_CREATE_ISSUE: {
                    tool_slug: 'GITHUB_CREATE_ISSUE',
                    toolkit: 'github',
                    description: 'Creates a GitHub issue',
                    hasFullSchema: true,
                    input_schema: { type: 'object', properties: {} },
                    output_schema: { type: 'object', properties: {} },
                  },
                },
                toolkit_connection_statuses: [],
                next_steps_guidance: [],
                session: {
                  id: 'trs_test_session',
                  generate_id: false,
                  instructions: 'Reuse this session id for follow-up calls.',
                },
                time_info: {
                  current_time_utc: '2026-01-01T00:00:00.000Z',
                  current_time_utc_epoch_seconds: 1767225600,
                  message: 'UTC time',
                },
              };
            }),
        },
      })
    )(
      '[Given] multiple queries [Then] search passes all queries to the tool-router session',
      it => {
        it.effect('passes batched queries without a parallel flag', () =>
          Effect.gen(function* () {
            yield* cli(['search', 'send', 'create issue']);

            expect(searchParams?.queries.map(query => query.use_case)).toEqual([
              'send',
              'create issue',
            ]);
          })
        );
      }
    );
  }

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData,
      fixture: 'global-test-user-id',
      toolRouter: {
        search: (_sessionId, params) =>
          Effect.succeed({
            success: true,
            error: null,
            results: [
              {
                index: 1,
                use_case: params.queries[0]?.use_case ?? '',
                primary_tool_slugs: ['GMAIL_SEND_EMAIL'],
                related_tool_slugs: [],
                toolkits: ['gmail'],
                recommended_plan_steps: ['Collect recipient details', 'Execute send action'],
              },
            ],
            tool_schemas: {
              GMAIL_SEND_EMAIL: {
                tool_slug: 'GMAIL_SEND_EMAIL',
                toolkit: 'gmail',
                description: 'Sends an email',
                hasFullSchema: true,
                input_schema: { type: 'object', properties: {} },
                output_schema: { type: 'object', properties: {} },
              },
            },
            toolkit_connection_statuses: [
              {
                toolkit: 'gmail',
                description: 'gmail toolkit',
                has_active_connection: false,
                status_message: 'No active connection',
              },
            ],
            next_steps_guidance: ['Fallback guidance'],
            session: {
              id: 'trs_test_session',
              generate_id: false,
              instructions: 'Reuse this session id for follow-up calls.',
            },
            time_info: {
              current_time_utc: '2026-01-01T00:00:00.000Z',
              current_time_utc_epoch_seconds: 1767225600,
              message: 'UTC time',
            },
          }),
      },
    })
  )('[Given] search response with recommended plan [Then] it prints plan and execute hint', it => {
    it.effect('prints plan and command hints', () =>
      Effect.gen(function* () {
        yield* cli(['search', 'send email', '--human']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Plan:');
        expect(output).toContain('1. Collect recipient details');
        expect(output).toContain('Execute a tool:');
        expect(output).toContain(`composio execute "GMAIL_SEND_EMAIL" -d "{}"`);
        expect(output).toContain(`composio link <toolkit>`);
      })
    );
  });

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['search', 'send', '--human']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  {
    let createParams: SessionCreateParams | undefined;

    layer(
      TestLive({
        ...testLiveOptions,
        toolRouter: {
          create: params =>
            Effect.sync(() => {
              createParams = params;
              return {
                session_id: 'trs_test_session',
                config: {
                  user_id: params.user_id,
                  execute: {},
                  search: {},
                  preload: { tools: [] },
                  instant: false,
                },
                config_version: 1,
                mcp: { type: 'http', url: 'https://mcp.test.composio.dev' },
                tool_router_tools: ['COMPOSIO_SEARCH_TOOLS'],
              };
            }),
        },
      })
    )('[Given] consumer search [Then] it uses the resolved consumer user id', it => {
      it.effect('uses consumer user id from the resolved project context', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send']);

          expect(createParams?.user_id).toBe('consumer-user-org_test');
        })
      );
    });
  }

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'user-config-with-global-context',
      toolkitsData,
    })
  )('[Given] no explicit --user-id [Then] consumer search does not require one', it => {
    it.effect('runs without printing global test user diagnostics', () =>
      Effect.gen(function* () {
        yield* cli(['search', 'send']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('"results"');
        expect(output).toContain('GMAIL_SEND_EMAIL');
        expect(output).not.toContain('Using global test user id');
      })
    );
  });

  layer(TestLive(testLiveOptions))(
    '[Given] composio search [Then] runs the root search flow',
    it => {
      it.effect('search returns matching tools', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--human']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('SLACK_SEND_MESSAGE');
          expect(output).toContain('Found 2 tools');
        })
      );
    }
  );

  layer(
    TestLive({
      ...testLiveOptions,
      // A response without the field at all, which only a mock can answer.
      accountData: { consumerUserId: null },
    })
  )('[Given] no consumer user id [Then] the search fails with the missing-user error', it => {
    it.effect('[Then] the message points at composio login', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['search', 'send']).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(MissingActingUserError);
        expect(failure).toMatchObject({
          message: 'Missing consumer user id. Run `composio login` and try again.',
        });
      })
    );
  });

  layer(
    TestLive({
      ...testLiveOptions,
      // The backend's "logged in, but no consumer user" shape counts as no user.
      accountData: { consumerUserId: '' },
    })
  )('[Given] an empty consumer user id [Then] the search fails with the missing-user error', it => {
    it.effect('[Then] no results are printed', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['search', 'send']).pipe(Effect.flip);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(failure).toBeInstanceOf(MissingActingUserError);
        expect(failure).toMatchObject({
          message: 'Missing consumer user id. Run `composio login` and try again.',
        });
        expect(output).not.toContain('GMAIL_SEND_EMAIL');
      })
    );
  });
});
