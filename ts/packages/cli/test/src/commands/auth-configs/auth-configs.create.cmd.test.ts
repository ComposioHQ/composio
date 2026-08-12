import { describe, expect, layer } from '@effect/vitest';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const dangerousDevConfig = {
  cliUserConfig: {
    developerDangerousCommandsEnabled: true,
  },
} satisfies TestLiveInput;

describe('CLI: composio dev auth-configs create', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, ...dangerousDevConfig }))(
    '[Given] --toolkit "gmail" [Then] creates with Composio managed auth',
    it => {
      it.scoped('creates successfully', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Auth config created');
          expect(output).toContain('ac_test');
          expect(output).toContain('OAUTH2');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, ...dangerousDevConfig }))(
    '[Given] named config --toolkit "gmail" [Then] creates with name',
    it => {
      it.scoped('creates with name successfully', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'auth-configs',
            'create',
            'my-config',
            '--toolkit',
            'gmail',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Auth config created');
          expect(output).toContain('ac_test');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, ...dangerousDevConfig }))(
    '[Given] --auth-scheme "OAUTH2" [Then] creates with custom auth',
    it => {
      it.scoped('creates with custom auth scheme', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
            '--auth-scheme',
            'OAUTH2',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Auth config created');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      ...dangerousDevConfig,
      authConfigsData: {
        createResponse: {
          auth_config: { id: 'ac_custom', auth_scheme: 'API_KEY', is_composio_managed: false },
          toolkit: { slug: 'slack' },
        },
      },
    })
  )('[Given] custom create response [Then] shows correct details', it => {
    it.scoped('shows custom response data', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'slack', '--dangerously-allow']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('ac_custom');
        expect(output).toContain('API_KEY');
        expect(output).toContain('slack');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, ...dangerousDevConfig }))(
    '[Given] invalid JSON in --custom-credentials [Then] shows error',
    it => {
      it.scoped('shows JSON parse error', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
            '--auth-scheme',
            'OAUTH2',
            '--custom-credentials',
            '{invalid json}',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Invalid JSON');
        })
      );
    }
  );

  layer(TestLive({ ...dangerousDevConfig }))(
    '[Given] no API key [Then] warns user to login',
    it => {
      it.scoped('warns user to login', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not logged in');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, ...dangerousDevConfig }))(
    '[Given] next step hint [Then] includes auth config ID',
    it => {
      it.scoped('shows next step hint', () =>
        Effect.gen(function* () {
          yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
            '--dangerously-allow',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('composio dev auth-configs info');
        })
      );
    }
  );

  let capturedCreateAuthConfig: AuthConfigCreateParams | undefined;

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      ...dangerousDevConfig,
      authConfigsData: {
        createResponse: {
          auth_config: { id: 'ac_oauth', auth_scheme: 'OAUTH2', is_composio_managed: false },
          toolkit: { slug: 'shopify' },
        },
        onCreate: params => {
          capturedCreateAuthConfig = params;
        },
      },
    })
  )(
    '[Given] custom OAuth credentials and scopes [Then] nests them under auth_config.credentials',
    it => {
      it.scoped('sends custom OAuth settings inside credentials', () =>
        Effect.gen(function* () {
          capturedCreateAuthConfig = undefined;

          yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'shopify',
            '--auth-scheme',
            'OAUTH2',
            '--custom-credentials',
            '{"client_id":"my_client_id","client_secret":"my_client_secret"}',
            '--scopes',
            'read_products, write_products',
            '--dangerously-allow',
          ]);

          expect(capturedCreateAuthConfig).toStrictEqual({
            toolkit: { slug: 'shopify' },
            auth_config: {
              type: 'use_custom_auth',
              authScheme: 'OAUTH2',
              name: undefined,
              credentials: {
                client_id: 'my_client_id',
                client_secret: 'my_client_secret',
                scopes: ['read_products', 'write_products'],
              },
            },
          });
        })
      );
    }
  );
});
