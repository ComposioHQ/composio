import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { hasRecordedAuthRejection } from 'src/services/auth-rejection';
import { userApiKeyRejectionResponse } from 'test/__utils__/models/user-api-key-rejection';
import { afterEach, vi } from 'vitest';

describe('CLI: composio whoami', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const testConfigProvider = ConfigProvider.fromEnv({
    env: { COMPOSIO_USER_API_KEY: 'api_key_from_test_config_provider' },
  }).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.effect('[Given] `COMPOSIO_USER_API_KEY` [Then] prints global user context JSON', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unreachable'));
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).not.toContain(`api_key_from_test_config_provider`);
        expect(output).not.toContain(`global_user_api_key`);
        expect(output).toContain(`"email":null`);
        expect(output).toContain(`"current_org_name":null`);
        expect(output).not.toContain(`"test_user_id"`);
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))('with fixture', it => {
    it.effect('[Given] user_data.json in fixture [Then] prints global user context JSON', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unreachable'));
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).not.toContain(`api_key_from_test_fixture`);
        expect(output).not.toContain(`global_user_api_key`);
        expect(output).toContain(`"email":null`);
        expect(output).toContain(`"current_org_name":null`);
        expect(output).not.toContain(`"test_user_id"`);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with session info', it => {
    it.effect('[Given] session info is available [Then] prints email and org name', () =>
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
        expect(output).toContain(`"current_org_name":"Acme Org"`);
        expect(output).toContain('Current Org: Acme Org');
        expect(output).not.toContain('Default Org');
        expect(output).not.toContain('Test User ID');
      })
    );
  });

  layer(
    TestLive({
      userData: {
        api_key: 'uak_revoked',
        base_url: 'https://staging-backend.composio.dev',
        web_url: 'https://staging-dashboard.composio.dev/',
        org_id: 'org_staging',
      },
    })
  )('with a rejected stored key', it => {
    it.effect(
      '[Given] the backend rejects the key [Then] records it and prints no account note',
      () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
            Promise.resolve(userApiKeyRejectionResponse())
          );

          yield* cli(['whoami']);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).not.toContain('Email: unknown');
          expect(output).not.toContain('"account_type"');
          expect(yield* hasRecordedAuthRejection).toBe(true);
        })
    );
  });
});
