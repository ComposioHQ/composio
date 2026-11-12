import { assert, describe, expect, layer } from '@effect/vitest';
import { isUsageFailure } from 'src/commands/errors';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import { ConfigProvider, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import {
  DIRECTORY_PROJECT_SCOPE,
  DEFAULT_PROJECT_SCOPE,
  defaultDeveloperProjectAccountData,
  inDeveloperProjectDirectory,
  loginWithoutDeveloperProject,
  OTHER_DEVELOPER_PROJECT,
  OTHER_PROJECT_SCOPE,
  runRecordingRepositoryScopes,
} from 'test/__utils__/layers/developer-project';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

// Logged in, in a directory set up for a developer project.
const inProject = { ...inDeveloperProjectDirectory, baseConfigProvider: testConfigProvider };

const dangerousDevConfig = {
  cliUserConfig: {
    developerDangerousCommandsEnabled: true,
  },
} satisfies TestLiveInput;

describe('CLI: composio dev auth-configs create', () => {
  layer(TestLive({ ...inProject, ...dangerousDevConfig }))(
    '[Given] --toolkit "gmail" [Then] creates with Composio managed auth',
    it => {
      it.effect('creates successfully', () =>
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

  layer(TestLive({ ...inProject, ...dangerousDevConfig }))(
    '[Given] named config --toolkit "gmail" [Then] creates with name',
    it => {
      it.effect('creates with name successfully', () =>
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

  layer(TestLive({ ...inProject, ...dangerousDevConfig }))(
    '[Given] --auth-scheme "OAUTH2" [Then] creates with custom auth',
    it => {
      it.effect('creates with custom auth scheme', () =>
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
      ...inProject,
      ...dangerousDevConfig,
      authConfigsData: {
        createResponse: {
          auth_config: { id: 'ac_custom', auth_scheme: 'API_KEY', is_composio_managed: false },
          toolkit: { slug: 'slack' },
        },
      },
    })
  )('[Given] custom create response [Then] shows correct details', it => {
    it.effect('shows custom response data', () =>
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

  layer(TestLive({ ...inProject, ...dangerousDevConfig }))(
    '[Given] invalid JSON in --custom-credentials [Then] fails with a usage error',
    it => {
      it.effect('raises a CommandInputError naming --custom-credentials', () =>
        Effect.gen(function* () {
          const failure = yield* cli([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
            '--auth-scheme',
            'OAUTH2',
            '--custom-credentials',
            '{invalid json}',
          ]).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            option: '--custom-credentials',
            message: expect.stringContaining('Invalid JSON in --custom-credentials'),
          });
          // The invocation prints the message on stderr, and nothing else.
          assert(isUsageFailure(failure));
          expect(yield* MockConsole.getLines()).toEqual([failure.message]);
        })
      );
    }
  );

  layer(TestLive({ ...dangerousDevConfig }))(
    '[Given] no API key [Then] warns user to login',
    it => {
      it.effect('warns user to login', () =>
        Effect.gen(function* () {
          const error = yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'gmail']).pipe(
            Effect.flip
          );
          expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
        })
      );
    }
  );

  layer(TestLive({ ...inProject, ...dangerousDevConfig }))(
    '[Given] next step hint [Then] includes auth config ID',
    it => {
      it.effect('shows next step hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'create', '--toolkit', 'gmail']);
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
      ...inProject,
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
      it.effect('sends custom OAuth settings inside credentials', () =>
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

// The request goes to the developer project the command resolved, never to the one the backend
// would pick for the key.
describe('CLI: composio dev auth-configs create acts on the developer project', () => {
  layer(TestLive({ ...inProject, ...dangerousDevConfig }))(it => {
    it.effect.each([
      { given: 'a directory set up for a project', args: [], scope: DIRECTORY_PROJECT_SCOPE },
      {
        given: '--project-name',
        args: ['--project-name', OTHER_DEVELOPER_PROJECT.name],
        scope: OTHER_PROJECT_SCOPE,
      },
    ])('[Given] $given [Then] creates the auth config in that project', ({ args, scope }) =>
      Effect.gen(function* () {
        const { exitCode, calls } = yield* runRecordingRepositoryScopes([
          ...['dev', 'auth-configs', 'create', '--toolkit', 'gmail'],
          ...args,
        ]);

        expect(exitCode).toBe(0);
        expect(calls).toEqual([
          { method: 'createAuthConfig', scope: expect.objectContaining(scope) },
        ]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      ...dangerousDevConfig,
      accountData: defaultDeveloperProjectAccountData(),
    })
  )(it => {
    it.effect(
      '[Given] a directory set up for no project [Then] acts on the default developer project',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          const { exitCode, calls } = yield* runRecordingRepositoryScopes([
            'dev',
            'auth-configs',
            'create',
            '--toolkit',
            'gmail',
          ]);

          expect(exitCode).toBe(0);
          expect(calls).toEqual([
            { method: 'createAuthConfig', scope: expect.objectContaining(DEFAULT_PROJECT_SCOPE) },
          ]);
        })
    );
  });
});
