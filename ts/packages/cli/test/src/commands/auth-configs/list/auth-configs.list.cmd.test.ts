import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { AuthConfigItem } from 'src/models/auth-configs';
import type { MockAccountRequest } from 'test/__utils__/layers/accounts';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';
import {
  DEFAULT_PROJECT_SCOPE,
  defaultDeveloperProjectAccountData,
  DIRECTORY_PROJECT_SCOPE,
  inDeveloperProjectDirectory,
  loginWithoutDeveloperProject,
  NO_DIRECTORY_PROJECT_NOTICE,
  OTHER_DEVELOPER_PROJECT,
  OTHER_PROJECT_SCOPE,
  runRecordingRepositoryScopes,
} from 'test/__utils__/layers/developer-project';

const testAuthConfigs: AuthConfigItem[] = [
  {
    id: 'ac_gmail_default',
    name: 'Gmail Default',
    no_of_connections: 5,
    status: 'ENABLED',
    type: 'default',
    uuid: 'uuid-1',
    toolkit: { logo: '', slug: 'gmail' },
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_enabled_for_tool_router: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ac_slack_custom',
    name: 'Slack Custom',
    no_of_connections: 3,
    status: 'ENABLED',
    type: 'custom',
    uuid: 'uuid-2',
    toolkit: { logo: '', slug: 'slack' },
    auth_scheme: 'API_KEY',
    is_composio_managed: false,
    is_enabled_for_tool_router: false,
    created_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'ac_gmail_disabled',
    name: 'Gmail Disabled',
    no_of_connections: 0,
    status: 'DISABLED',
    type: 'default',
    uuid: 'uuid-3',
    toolkit: { logo: '', slug: 'gmail' },
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_enabled_for_tool_router: false,
    created_at: '2026-02-01T00:00:00Z',
  },
];

const authConfigsData = {
  items: testAuthConfigs,
} satisfies TestLiveInput['authConfigsData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

// Logged in, in a directory set up for a developer project.
const inProject = { ...inDeveloperProjectDirectory, baseConfigProvider: testConfigProvider };

describe('CLI: composio dev auth-configs list', () => {
  layer(TestLive({ ...inProject, authConfigsData }))(
    '[Given] no flags [Then] lists all auth configs',
    it => {
      it.effect('lists all auth configs with table', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_gmail_default');
          expect(output).toContain('ac_slack_custom');
          expect(output).toContain('ac_gmail_disabled');
          expect(output).toContain('Listing 3 of 3 auth configs');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, authConfigsData }))(
    '[Given] --toolkits "gmail" [Then] lists only gmail auth configs',
    it => {
      it.effect('filters by toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'list', '--toolkits', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_gmail_default');
          expect(output).toContain('ac_gmail_disabled');
          expect(output).not.toContain('ac_slack_custom');
          expect(output).toContain('Listing 2 of 2 auth configs');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, authConfigsData }))(
    '[Given] --query "Custom" [Then] shows filtered results',
    it => {
      it.effect('filters by name search', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'list', '--query', 'Custom']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('ac_slack_custom');
          expect(output).not.toContain('ac_gmail_default');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, authConfigsData }))(
    '[Given] --limit 1 [Then] respects limit',
    it => {
      it.effect('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'list', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 1 of 3 auth configs');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'auth-configs', 'list']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });

  layer(TestLive(inProject))('[Given] empty results [Then] shows no auth configs found', it => {
    it.effect('shows no auth configs found', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'auth-configs', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('No auth configs found');
      })
    );
  });

  layer(TestLive({ ...inProject, authConfigsData }))(
    '[Given] --toolkits "nonexistent" [Then] shows hint about toolkit slug',
    it => {
      it.effect('shows toolkit hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'auth-configs', 'list', '--toolkits', 'nonexistent']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No auth configs found');
          expect(output).toContain('composio dev toolkits list');
        })
      );
    }
  );
});

// The request goes to the developer project the command resolved, never to the one the backend
// would pick for the key.
describe('CLI: composio dev auth-configs list acts on the developer project', () => {
  layer(TestLive({ ...inProject, authConfigsData }))(it => {
    it.effect.each([
      { given: 'a directory set up for a project', args: [], scope: DIRECTORY_PROJECT_SCOPE },
      {
        given: '--project-name',
        args: ['--project-name', OTHER_DEVELOPER_PROJECT.name],
        scope: OTHER_PROJECT_SCOPE,
      },
    ])('[Given] $given [Then] lists that project’s auth configs', ({ args, scope }) =>
      Effect.gen(function* () {
        const { exitCode, calls } = yield* runRecordingRepositoryScopes([
          ...['dev', 'auth-configs', 'list'],
          ...args,
        ]);

        expect(exitCode).toBe(0);
        expect(calls).toEqual([
          { method: 'listAuthConfigs', scope: expect.objectContaining(scope) },
        ]);
      })
    );
  });

  // Before the command named a project, the backend answered from its default developer project;
  // a directory without a usable project of its own still gets that one, named on stderr.
  const sessionRequests: Array<MockAccountRequest> = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      authConfigsData,
      accountData: defaultDeveloperProjectAccountData(sessionRequests),
    })
  )(it => {
    it.effect(
      '[Given] a directory set up for no project [Then] lists the default developer project’s auth configs, saying so on stderr',
      () =>
        Effect.gen(function* () {
          yield* loginWithoutDeveloperProject;
          sessionRequests.length = 0;
          // Redirected streams, as under a script: only plain stderr lines and stdout data show.
          const terminal = redirectedTerminalUI();
          const { exitCode, calls } = yield* runRecordingRepositoryScopes(
            ['dev', 'auth-configs', 'list'],
            terminal.layer
          );

          expect(exitCode).toBe(0);
          expect(terminal.stderr()).toBe(`${NO_DIRECTORY_PROJECT_NOTICE}\n`);
          expect(JSON.parse(terminal.stdout()).map((item: { id: string }) => item.id)).toEqual(
            testAuthConfigs.map(item => item.id)
          );
          // One session-info read in the logged-in org picks the project every request names.
          expect(
            sessionRequests.filter(({ operation }) => operation === 'auth.session.retrieveInfo')
          ).toEqual([
            expect.objectContaining({ scope: expect.objectContaining({ orgId: 'org_test' }) }),
          ]);
          expect(calls).toEqual([
            { method: 'listAuthConfigs', scope: expect.objectContaining(DEFAULT_PROJECT_SCOPE) },
          ]);
        })
    );
  });
});
