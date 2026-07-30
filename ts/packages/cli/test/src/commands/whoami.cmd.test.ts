import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { makeFakeKeyring } from 'test/__utils__/services/keyring';
import { KEYRING_SERVICE, KEYRING_USER } from 'src/services/user-context';
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
        expect(output).toContain(`"current_org_name":null`);
        expect(output).not.toContain(`"test_user_id"`);
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
        expect(output).toContain(`"current_org_name":null`);
        expect(output).not.toContain(`"test_user_id"`);
      })
    );
  });

  // A logout that could not confirm the secure delete leaves the credential
  // in the store. `whoami` must agree with logout, not with the store.
  const tombstonedKeyring = makeFakeKeyring({
    seed: [[KEYRING_SERVICE, KEYRING_USER, 'uak_orphaned_by_logout']],
  });

  layer(TestLive({ keyring: tombstonedKeyring, fixture: 'user-config-pending-logout' }))(
    'with a pending keyring logout',
    it => {
      it.scoped('[Given] a pending secure cleanup [Then] reports logged out', () =>
        Effect.gen(function* () {
          yield* cli(['whoami']);

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('You are not logged in yet.');
          expect(output).not.toContain('uak_orphaned_by_logout');
        })
      );
    }
  );

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
        expect(output).toContain(`"current_org_name":"Acme Org"`);
        expect(output).toContain('Current Org: Acme Org');
        expect(output).not.toContain('Default Org');
        expect(output).not.toContain('Test User ID');
      })
    );
  });
});
