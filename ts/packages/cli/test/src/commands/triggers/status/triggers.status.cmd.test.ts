import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { TriggerInstanceItem } from 'src/models/triggers';
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

const testTriggers: TriggerInstanceItem[] = [
  {
    id: 'trg_active_1',
    uuid: 'uuid-trg-active-1',
    trigger_name: 'GMAIL_NEW_GMAIL_MESSAGE',
    connected_account_id: 'con_gmail_1',
    auth_config_id: 'ac_gmail_1',
    user_id: 'user_default',
    disabled_at: null,
    updated_at: '2026-02-01T00:00:00Z',
    trigger_data: '',
    state: {},
    trigger_config: {},
  },
  {
    id: 'trg_active_2',
    uuid: 'uuid-trg-active-2',
    trigger_name: 'SLACK_NEW_MESSAGE',
    connected_account_id: 'con_slack_1',
    auth_config_id: 'ac_slack_1',
    user_id: 'user_123',
    disabled_at: null,
    updated_at: '2026-02-02T00:00:00Z',
    trigger_data: '',
    state: {},
    trigger_config: {},
  },
  {
    id: 'trg_disabled_1',
    uuid: 'uuid-trg-disabled-1',
    trigger_name: 'GITHUB_COMMIT_EVENT',
    connected_account_id: 'con_github_1',
    auth_config_id: 'ac_github_1',
    user_id: 'user_default',
    disabled_at: '2026-02-03T00:00:00Z',
    updated_at: '2026-02-03T00:00:00Z',
    trigger_data: '',
    state: {},
    trigger_config: {},
  },
];

const triggersData = {
  items: testTriggers,
} satisfies TestLiveInput['triggersData'];

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

// Logged in, in a directory set up for a developer project.
const inProject = { ...inDeveloperProjectDirectory, baseConfigProvider: testConfigProvider };

describe('CLI: composio dev triggers status', () => {
  layer(TestLive({ ...inProject, triggersData }))(
    '[Given] no flags [Then] lists active triggers only',
    it => {
      it.effect('lists active trigger instances', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_1');
          expect(output).toContain('trg_active_2');
          expect(output).not.toContain('trg_disabled_1');
          expect(output).toContain('Listing 2 of 2 triggers');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, triggersData }))(
    '[Given] --show-disabled [Then] includes disabled triggers',
    it => {
      it.effect('includes disabled trigger instances', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--show-disabled']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_1');
          expect(output).toContain('trg_disabled_1');
          expect(output).toContain('Listing 3 of 3 triggers');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, triggersData }))(
    '[Given] --user-ids [Then] filters by user IDs',
    it => {
      it.effect('filters by user_ids', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--user-ids', 'user_123']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_2');
          expect(output).not.toContain('trg_active_1');
          expect(output).toContain('Listing 1 of 1 triggers');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, triggersData }))(
    '[Given] --trigger-names lowercase [Then] applies case-insensitive filter',
    it => {
      it.effect('normalizes trigger names to uppercase', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--trigger-names', 'gmail_new_gmail_message']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_1');
          expect(output).not.toContain('trg_active_2');
          expect(output).toContain('Listing 1 of 1 triggers');
        })
      );
    }
  );

  layer(TestLive({ ...inProject, triggersData }))(
    '[Given] --toolkits [Then] filters by toolkit slug',
    it => {
      it.effect('filters by toolkit prefix in trigger name', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'status', '--toolkits', 'slack']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('trg_active_2');
          expect(output).not.toContain('trg_active_1');
          expect(output).toContain('Listing 1 of 2 triggers');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'triggers', 'status']).pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});

// The request goes to the developer project the command resolved, never to the one the backend
// would pick for the key.
describe('CLI: composio dev triggers status acts on the developer project', () => {
  layer(TestLive({ ...inProject, triggersData }))(it => {
    it.effect.each([
      { given: 'a directory set up for a project', args: [], scope: DIRECTORY_PROJECT_SCOPE },
      {
        given: '--project-name',
        args: ['--project-name', OTHER_DEVELOPER_PROJECT.name],
        scope: OTHER_PROJECT_SCOPE,
      },
    ])('[Given] $given [Then] lists that project’s triggers', ({ args, scope }) =>
      Effect.gen(function* () {
        const { exitCode, calls } = yield* runRecordingRepositoryScopes([
          ...['dev', 'triggers', 'status'],
          ...args,
        ]);

        expect(exitCode).toBe(0);
        expect(calls).toEqual([
          { method: 'listActiveTriggers', scope: expect.objectContaining(scope) },
        ]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      triggersData,
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
            'triggers',
            'status',
          ]);

          expect(exitCode).toBe(0);
          expect(calls).toEqual([
            { method: 'listActiveTriggers', scope: expect.objectContaining(DEFAULT_PROJECT_SCOPE) },
          ]);
        })
    );
  });
});
