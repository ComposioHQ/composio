import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, DateTime, Effect } from 'effect';
import type { ToolkitDetailed } from 'src/models/toolkits';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const gmail: ToolkitDetailed = {
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
    available_versions: ['20250101'],
    tools_count: 36,
    triggers_count: 2,
  },
  auth_config_details: [],
};

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
  fixture: 'global-test-user-id',
  toolkitsData: { detailedToolkits: [gmail] },
});

const SESSION_TOOLKITS = '/api/v3.1/tool_router/session/trs_stub_session/toolkits';

/** Session toolkit reads answered by `respond`; the session they run in is created normally. */
const toolkitsOver = (respond: () => Response) =>
  stubClientResources(
    ['toolRouter'],
    routeRequests([{ method: 'GET', path: SESSION_TOOLKITS, respond }], () =>
      Response.json({
        session_id: 'trs_stub_session',
        config: { user_id: 'global-default' },
        mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
        tool_router_tools: [],
      })
    )
  );

describe('CLI: composio dev toolkits info over the API client', () => {
  layer(testLayer)('[Given] a session toolkit in a shape the API contract does not allow', it => {
    it.effect('[Then] the toolkit and its connection are shown', () =>
      Effect.gen(function* () {
        // No `meta.logo`, no page counts, and a connected account without
        // `created_at` or `auth_config`.
        const page = {
          items: [
            {
              name: 'Gmail',
              slug: 'gmail',
              enabled: true,
              is_no_auth: false,
              composio_managed_auth_schemes: ['OAUTH2'],
              meta: { description: 'Email service to send and receive emails' },
              connected_account: { id: 'ca_gmail_1', user_id: 'global-default', status: 'ACTIVE' },
            },
          ],
          next_cursor: null,
        };
        const stub = toolkitsOver(() => Response.json(page));
        yield* cli(['dev', 'toolkits', 'info', 'gmail']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Connection Status: ACTIVE');
        expect(output).toContain('Connected Account ID: ca_gmail_1');
        expect(output).toContain('Auth Scheme: -');
        expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({
          slug: 'gmail',
          connected_account: {
            status: 'ACTIVE',
            id: 'ca_gmail_1',
            auth_scheme: null,
            is_composio_managed: null,
          },
        });
        expect(stub.requests.filter(request => request.path.startsWith(SESSION_TOOLKITS))).toEqual([
          { method: 'GET', path: `${SESSION_TOOLKITS}?toolkits=gmail` },
        ]);
      })
    );
  });
});
