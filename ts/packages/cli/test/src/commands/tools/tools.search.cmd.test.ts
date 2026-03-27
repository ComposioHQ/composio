import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import type {
  SessionCreateParams,
  SessionSearchParams,
} from '@composio/client/resources/tool-router';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Tools } from 'src/models/tools';

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

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const testLiveOptions = {
  baseConfigProvider: testConfigProvider,
  toolkitsData,
  fixture: 'global-test-user-id' as const,
};

const extractFirstJsonObject = (output: string): Record<string, unknown> | null => {
  const start = output.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < output.length; i += 1) {
    const char = output[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(output.slice(start, i + 1)) as Record<string, unknown>;
      }
    }
  }

  return null;
};

describe('CLI: composio search', () => {
  layer(TestLive(testLiveOptions))('[Given] query "send" [Then] returns JSON by default', it => {
    it.scoped('returns JSON payload by default', () =>
      Effect.gen(function* () {
        yield* cli(['search', 'send']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        const parsed = extractFirstJsonObject(output);

        expect(parsed).not.toBeNull();
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

  layer(TestLive(testLiveOptions))(
    '[Given] multiple queries [Then] the CLI returns a batched JSON response',
    it => {
      it.scoped('returns batched results in JSON', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', 'create issue']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('"use_case": "send"');
          expect(output).toContain('"use_case": "create issue"');
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
      it.scoped('shows empty json output', () =>
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
      it.scoped('scopes search to toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--toolkits', 'gmail', '--human']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const humanOutput = output.split('\n{')[0] ?? output;

          expect(humanOutput).toContain('GMAIL_SEND_EMAIL');
          expect(humanOutput).not.toContain('SLACK_SEND_MESSAGE');
          expect(humanOutput).toContain('Found 1 tools');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] search --human [Then] it stays human-readable and omits raw JSON',
    it => {
      it.scoped('does not print raw JSON in human mode', () =>
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
      it.scoped('prints full search response with next steps for jq', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send', '--json']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const parsed = extractFirstJsonObject(output);

          expect(parsed).not.toBeNull();
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

  layer(TestLive(testLiveOptions))(
    '[Given] search results with workbench snippets [Then] snippets are removed from JSON output',
    it => {
      it.scoped('omits workbench snippets and emits schema/cache references', () =>
        Effect.gen(function* () {
          const live = TestLive({
            ...testLiveOptions,
            toolRouter: {
              search: async (_sessionId, params) => ({
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
          });

          yield* cli(['search', 'send']).pipe(Effect.provide(live));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).not.toContain('reference_workbench_snippets');
          expect(output).toContain('~/.composio/tool_definitions/GMAIL_SEND_EMAIL.json');
          expect(output).toContain('"related_tools_path_format"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] search with schema properties [Then] next steps have valid payload and lowercase link',
    it => {
      it.scoped('next steps use valid payload from input_schema and lowercase toolkit', () =>
        Effect.gen(function* () {
          const live = TestLive({
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
          });

          yield* cli(['search', 'send']).pipe(Effect.provide(live));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const parsed = extractFirstJsonObject(output);
          const nextSteps = parsed?.next_steps as
            | {
                steps?: Array<{ action: string; command: string }>;
              }
            | undefined;

          expect(nextSteps?.steps).toBeTruthy();

          const executeStep = nextSteps?.steps?.find(step => step.action === 'Execute a tool');
          expect(executeStep).toBeTruthy();
          expect(executeStep!.command).toContain('composio execute "GMAIL_SEND_EMAIL"');
          expect(executeStep!.command).toMatch(/-d '\{"to":"","subject":"","body":""\}'/);

          const linkStep = nextSteps?.steps?.find(step => step.action === 'Link a user account');
          expect(linkStep).toBeTruthy();
          expect(linkStep!.command).toBe('composio link gmail');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] search with empty schema [Then] next steps execute uses -d "{}"',
    it => {
      it.scoped('next steps use -d "{}" when no schema properties', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const parsed = extractFirstJsonObject(output);
          const nextSteps = parsed?.next_steps as
            | {
                steps?: Array<{ action: string; command: string }>;
              }
            | undefined;

          const executeStep = nextSteps?.steps?.find(step => step.action === 'Execute a tool');
          expect(executeStep).toBeTruthy();
          expect(executeStep!.command).toContain('-d "{}"');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] --toolkits filter [Then] it is passed to session create as enabled toolkits',
    it => {
      it.scoped('passes toolkit filter into tool router session', () =>
        Effect.gen(function* () {
          let createParams: SessionCreateParams | undefined;
          let searchParams: SessionSearchParams | undefined;

          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            toolkitsData,
            fixture: 'global-test-user-id',
            toolRouter: {
              create: async params => {
                createParams = params;
                return {
                  session_id: 'trs_test_session',
                  config: { user_id: params.user_id },
                  mcp: { type: 'http', url: 'https://mcp.test.composio.dev' },
                  tool_router_tools: ['COMPOSIO_SEARCH_TOOLS'],
                };
              },
              search: async (_sessionId, params) => {
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
              },
            },
          });

          yield* cli(['search', 'send', '--toolkits', 'gmail,outlook']).pipe(Effect.provide(live));

          expect(createParams?.toolkits).toEqual({ enable: ['gmail', 'outlook'] });
          expect(searchParams?.queries[0]?.use_case).toBe('send');
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] multiple queries [Then] search passes all queries to the tool-router session',
    it => {
      it.scoped('passes batched queries without a parallel flag', () =>
        Effect.gen(function* () {
          let searchParams: SessionSearchParams | undefined;

          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            toolkitsData,
            fixture: 'global-test-user-id',
            toolRouter: {
              search: async (_sessionId, params) => {
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
              },
            },
          });

          yield* cli(['search', 'send', 'create issue']).pipe(Effect.provide(live));

          expect(searchParams?.queries.map(query => query.use_case)).toEqual([
            'send',
            'create issue',
          ]);
        })
      );
    }
  );

  layer(TestLive(testLiveOptions))(
    '[Given] search response with recommended plan [Then] it prints plan and execute hint',
    it => {
      it.scoped('prints plan and command hints', () =>
        Effect.gen(function* () {
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            toolkitsData,
            fixture: 'global-test-user-id',
            toolRouter: {
              search: async (_sessionId, params) => ({
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
          });

          yield* cli(['search', 'send email', '--human']).pipe(Effect.provide(live));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Plan:');
          expect(output).toContain('1. Collect recipient details');
          expect(output).toContain('Execute a tool:');
          expect(output).toContain(`composio execute "GMAIL_SEND_EMAIL" -d "{}"`);
          expect(output).toContain(`composio link <toolkit>`);
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['search', 'send', '--human']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive(testLiveOptions))(
    '[Given] consumer search [Then] it uses the resolved consumer user id',
    it => {
      it.scoped('uses consumer user id from the resolved project context', () =>
        Effect.gen(function* () {
          let createParams: SessionCreateParams | undefined;
          const live = TestLive({
            ...testLiveOptions,
            toolRouter: {
              create: async params => {
                createParams = params;
                return {
                  session_id: 'trs_test_session',
                  config: { user_id: params.user_id },
                  mcp: { type: 'http', url: 'https://mcp.test.composio.dev' },
                  tool_router_tools: ['COMPOSIO_SEARCH_TOOLS'],
                };
              },
            },
          });

          yield* cli(['search', 'send']).pipe(Effect.provide(live));

          expect(createParams?.user_id).toBe('consumer-user-org_test');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'user-config-with-global-context',
      toolkitsData,
    })
  )('[Given] no explicit --user-id [Then] consumer search does not require one', it => {
    it.scoped('runs without printing global test user diagnostics', () =>
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
      it.scoped('search returns matching tools', () =>
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
});
