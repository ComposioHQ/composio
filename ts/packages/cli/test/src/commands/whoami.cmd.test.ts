import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { afterEach, vi } from 'vitest';

describe('CLI: composio whoami', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const testConfigProvider = ConfigProvider.fromMap(
    new Map([['COMPOSIO_USER_API_KEY', 'api_key_from_test_config_provider']])
  ).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.scoped('[Given] `COMPOSIO_USER_API_KEY` [Then] prints global user context JSON', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).not.toContain(`api_key_from_test_config_provider`);
        expect(output).not.toContain(`global_user_api_key`);
        expect(output).toContain(`"email":null`);
        expect(output).toContain(`"default_org_name":null`);
        expect(output).toContain(`"default_org_id":null`);
        expect(output).toContain(`"test_user_id":null`);
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))('with fixture', it => {
    it.scoped('[Given] user_data.json in fixture [Then] prints global user context JSON', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).not.toContain(`api_key_from_test_fixture`);
        expect(output).not.toContain(`global_user_api_key`);
        expect(output).toContain(`"email":null`);
        expect(output).toContain(`"default_org_name":null`);
        expect(output).toContain(`"default_org_id":null`);
        expect(output).toContain(`"test_user_id":null`);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with session info', it => {
    it.scoped('[Given] session info is available [Then] prints email and org name', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          new Response(
            JSON.stringify({
              project: {
                name: 'Test Project',
                id: 'proj_123',
                org_id: 'org_123',
                nano_id: 'proj_nano_123',
                email: 'project@example.com',
                created_at: '2026-03-27T00:00:00.000Z',
                updated_at: '2026-03-27T00:00:00.000Z',
                org: {
                  name: 'Acme Org',
                  id: 'org_123',
                  plan: 'enterprise',
                },
              },
              org_member: {
                id: 'om_123',
                user_id: 'usr_123',
                email: 'person@example.com',
                name: 'Test Person',
                role: 'admin',
              },
              api_key: null,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );

        yield* cli(['whoami']);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`"email":"person@example.com"`);
        expect(output).toContain(`"default_org_name":"Acme Org"`);
      })
    );
  });
});
