import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extractErrorDetails } from 'src/effect-errors/logic/errors/extract-error-details';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const sendEmailInput = {
  type: 'object',
  properties: { recipient_email: { type: 'string' }, body: { type: 'string' } },
  required: ['recipient_email'],
};

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
  toolkitsData: {
    tools: [
      {
        name: 'Send Email',
        slug: 'GMAIL_SEND_EMAIL',
        description: 'Send an email',
        tags: [],
        available_versions: ['20260101_00'],
        input_parameters: sendEmailInput,
        output_parameters: { type: 'object', properties: {} },
      },
      {
        name: 'Create Draft',
        slug: 'GMAIL_CREATE_EMAIL_DRAFT',
        description: 'Create a draft',
        tags: [],
        available_versions: ['20260101_00'],
        input_parameters: { type: 'object', properties: {} },
        output_parameters: { type: 'object', properties: {} },
      },
    ],
  },
});

const searchResponse = {
  success: true,
  error: null,
  results: [
    {
      index: 1,
      use_case: 'send an email',
      difficulty: 'easy',
      primary_tool_slugs: ['GMAIL_SEND_EMAIL'],
      related_tool_slugs: ['GMAIL_CREATE_EMAIL_DRAFT'],
      toolkits: ['gmail'],
    },
  ],
  toolkit_connection_statuses: [
    {
      toolkit: 'gmail',
      description: 'Gmail toolkit',
      has_active_connection: true,
      status_message: 'Connected',
    },
  ],
  tool_schemas: {
    GMAIL_SEND_EMAIL: {
      toolkit: 'gmail',
      tool_slug: 'GMAIL_SEND_EMAIL',
      description: 'Send an email',
      hasFullSchema: true,
      input_schema: sendEmailInput,
    },
    GMAIL_CREATE_EMAIL_DRAFT: {
      toolkit: 'gmail',
      tool_slug: 'GMAIL_CREATE_EMAIL_DRAFT',
      description: 'Create a draft',
      hasFullSchema: true,
      input_schema: { type: 'object', properties: {} },
    },
  },
  time_info: {
    current_time_utc: '2026-01-01T00:00:00.000Z',
    current_time_utc_epoch_seconds: 1767225600,
    message: 'UTC time',
  },
  session: { id: 'trs_stub_session', generate_id: false, instructions: 'Reuse this session id.' },
  next_steps_guidance: [],
};

const SEARCH_PATH = '/api/v3.1/tool_router/session/trs_stub_session/search';

/** Searches answered by `respond`; the session they run in is created normally. */
const searchingOver = (respond: () => Response) =>
  stubClientResources(
    ['toolRouter'],
    routeRequests([{ method: 'POST', path: SEARCH_PATH, respond }], () =>
      Response.json({
        session_id: 'trs_stub_session',
        config: { user_id: 'consumer-user-org_test' },
        mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
        tool_router_tools: [],
      })
    )
  );

describe('CLI: composio search over the API client', () => {
  layer(testLayer)('[Given] a search response', it => {
    it.effect('[Then] the JSON payload lists the tools, their schemas and the next steps', () =>
      Effect.gen(function* () {
        const stub = searchingOver(() => Response.json(searchResponse));
        yield* cli(['search', 'send an email']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        const payload = {
          results: [
            {
              index: 1,
              use_case: 'send an email',
              difficulty: 'easy',
              primary_tool_slugs: ['GMAIL_SEND_EMAIL'],
              related_tool_slugs: ['GMAIL_CREATE_EMAIL_DRAFT'],
              toolkits: ['gmail'],
            },
          ],
          tool_schemas: {
            primary: { GMAIL_SEND_EMAIL: '~/.composio/tool_definitions/GMAIL_SEND_EMAIL.json' },
            related_tools_path_format: '~/.composio/tool_definitions/<TOOL_SLUG>.json',
          },
          connected_toolkits: ['gmail'],
          next_steps: {
            guidance:
              'You can directly proceed with these steps without waiting for the user to ask. Link accounts first if needed, then execute tools.',
            steps: [
              { action: 'Link a user account', command: 'composio link gmail' },
              {
                action: 'Execute a tool',
                command: `composio execute "GMAIL_SEND_EMAIL" -d '{"recipient_email":"","body":""}'`,
              },
            ],
          },
        };
        // Once as the log line and once as the piped output.
        expect(lines).toEqual([JSON.stringify(payload, null, 2), JSON.stringify(payload, null, 2)]);
        expect(stub.requests.filter(request => request.path === SEARCH_PATH)).toEqual([
          {
            method: 'POST',
            path: SEARCH_PATH,
            body: { queries: [{ use_case: 'send an email' }] },
          },
        ]);
      })
    );
  });

  layer(testLayer)('[Given] a search response in a shape the API contract does not allow', it => {
    it.effect('[Then] the tools and connected toolkits are still reported', () =>
      Effect.gen(function* () {
        // A sharing model the client does not know, no `status_message`, no
        // `description`, no `time_info`, and no `session`.
        const driftedResponse = {
          success: true,
          error: null,
          results: searchResponse.results,
          toolkit_connection_statuses: [
            { toolkit: 'gmail', has_active_connection: true, account_type: 'ORG' },
          ],
          tool_schemas: searchResponse.tool_schemas,
          next_steps_guidance: [],
        };
        const stub = searchingOver(() => Response.json(driftedResponse));
        yield* cli(['search', 'send an email']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const payload = JSON.parse(String(lines.at(-1)));

        expect(payload.results).toEqual(searchResponse.results);
        expect(payload.tool_schemas.primary).toEqual({
          GMAIL_SEND_EMAIL: '~/.composio/tool_definitions/GMAIL_SEND_EMAIL.json',
        });
        expect(payload.connected_toolkits).toEqual(['gmail']);
      })
    );
  });

  layer(testLayer)('[Given] the API rejects the search', it => {
    it.effect('[Then] the command fails with the status and response body as the cause', () =>
      Effect.gen(function* () {
        const stub = searchingOver(() =>
          Response.json(
            {
              error: { message: 'Query too long', code: 1400, slug: 'Search_Invalid', status: 400 },
            },
            { status: 400 }
          )
        );
        const failure = yield* cli(['search', 'send an email']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({ _tag: 'commands/ToolsSearchRequestError' });
        expect(extractErrorDetails(failure).message).toBe(
          'Failed to search tools.\nCaused by: 400 {"error":{"message":"Query too long","code":1400,"slug":"Search_Invalid","status":400}}'
        );
      })
    );
  });
});
