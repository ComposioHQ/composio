import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';

describe('CLI: composio whoami', () => {
  const testConfigProvider = ConfigProvider.fromEnv({
    env: { COMPOSIO_USER_API_KEY: 'api_key_from_test_config_provider' },
  }).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.effect('[Given] `COMPOSIO_USER_API_KEY` [Then] prints global user context JSON', () =>
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
    it.effect('[Given] user_data.json in fixture [Then] prints global user context JSON', () =>
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

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      accountData: {
        sessionInfo: makeSessionInfo({
          orgId: 'org_123',
          orgName: 'Acme Org',
          orgMemberId: 'om_123',
          email: 'person@example.com',
          name: 'Test Person',
        }),
      },
    })
  )('with session info', it => {
    it.effect('[Given] session info is available [Then] prints email and org name', () =>
      Effect.gen(function* () {
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
