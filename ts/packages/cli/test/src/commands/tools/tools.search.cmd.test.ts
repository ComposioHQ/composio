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

describe('CLI: composio tools search', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query "send" [Then] returns matching tools',
    it => {
      it.scoped('returns matching tools', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'search', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('SLACK_SEND_MESSAGE');
          expect(output).not.toContain('GITHUB_CREATE_ISSUE');
          expect(output).toContain('Found 2 tools');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query with no results [Then] shows not found message',
    it => {
      it.scoped('shows not found message', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'search', 'nonexistent_query']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No tools found');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] query "send" --toolkits "gmail" [Then] scopes to toolkit',
    it => {
      it.scoped('scopes search to toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'search', 'send', '--toolkits', 'gmail']);
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

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] tools search [Then] JSON output includes full tool-router payload',
    it => {
      it.scoped('prints full search response for jq', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'search', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('"results"');
          expect(output).toContain('"tool_schemas"');
          expect(output).toContain('"toolkit_connection_statuses"');
          expect(output).toContain('"session"');
          expect(output).toContain('"time_info"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --toolkits filter [Then] it is passed to session create as enabled toolkits',
    it => {
      it.scoped('passes toolkit filter into tool router session', () =>
        Effect.gen(function* () {
          let createParams: SessionCreateParams | undefined;
          let searchParams: SessionSearchParams | undefined;

          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            toolkitsData,
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

          yield* cli(['tools', 'search', 'send', '--toolkits', 'gmail,outlook']).pipe(
            Effect.provide(live)
          );

          expect(createParams?.toolkits).toEqual({ enable: ['gmail', 'outlook'] });
          expect(searchParams?.queries[0]?.use_case).toBe('send');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] search response with recommended plan [Then] it prints plan and execute hint',
    it => {
      it.scoped('prints plan and command hints', () =>
        Effect.gen(function* () {
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            toolkitsData,
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

          yield* cli(['tools', 'search', 'send email']).pipe(Effect.provide(live));
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Plan:');
          expect(output).toContain('1. Collect recipient details');
          expect(output).toContain('Hints:');
          expect(output).toContain('composio tools info "GMAIL_SEND_EMAIL"');
          expect(output).toContain(
            `composio tools execute "GMAIL_SEND_EMAIL" --user-id "<user-id>" --arguments '{}'`
          );
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'search', 'send']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] composio search alias [Then] works like composio tools search',
    it => {
      it.scoped('alias expands to tools search', () =>
        Effect.gen(function* () {
          yield* cli(['search', 'send']);
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
