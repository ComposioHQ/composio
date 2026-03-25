import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev auth-configs create', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] --toolkit "gmail" [Then] creates with Composio managed auth',
    it => {
      it.scoped('creates successfully', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Auth config created');
          expect(output).toContain('ac_test');
          expect(output).toContain('OAUTH2');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] named config --toolkit "gmail" [Then] creates with name',
    it => {
      it.scoped('creates with name successfully', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'create', 'my-config', '--toolkit', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Auth config created');
          expect(output).toContain('ac_test');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
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
        yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'slack']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('ac_custom');
        expect(output).toContain('API_KEY');
        expect(output).toContain('slack');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
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
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Invalid JSON');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] next step hint [Then] includes auth config ID',
    it => {
      it.scoped('shows next step hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('composio dev auth-configs info');
        })
      );
    }
  );
});
