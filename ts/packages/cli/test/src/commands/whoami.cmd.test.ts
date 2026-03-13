import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio whoami', () => {
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
        expect(output).toContain(`"default_org_id":null`);
        expect(output).toContain(`"default_project_id":null`);
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
        expect(output).toContain(`"default_org_id":null`);
        expect(output).toContain(`"default_project_id":null`);
        expect(output).toContain(`"test_user_id":null`);
      })
    );
  });
});
