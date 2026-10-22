import { describe, expect, it, vi } from '@effect/vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Effect, Exit, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { CommandRunner } from 'src/services/command-runner';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import {
  getSessionInfoByUserApiKey,
  listOrganizations,
  resolveConsumerProject,
} from 'src/services/composio-account';
import type { AuthConfigItem } from 'src/models/auth-configs';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import {
  CommandRunnerTest,
  ConnectedAccountsTest,
  SetupTest,
  TestLive,
  ToolkitsTest,
} from 'test/__utils__';
import { makeSessionInfo } from 'test/__utils__/models/account';
import { makeToolkitFixture } from 'test/__utils__/models/toolkits';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

describe('TestLayer', () => {
  it.effect('leaves globalThis.fetch untouched', () =>
    Effect.gen(function* () {
      const originalFetch = globalThis.fetch;

      yield* Effect.provide(Effect.void, TestLive()).pipe(Effect.scoped);

      expect(globalThis.fetch).toBe(originalFetch);
    })
  );

  it.effect('serves account endpoints from the mock client without calling fetch', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const [sessionInfo, consumerProject] = yield* Effect.all([
        getSessionInfoByUserApiKey({ userApiKey: 'uak_test', orgId: 'org_selected' }),
        resolveConsumerProject({ apiKey: 'uak_test', orgId: 'org_selected' }),
      ]).pipe(
        Effect.provide(
          TestLive({
            accountData: {
              sessionInfo: scope => makeSessionInfo({ orgId: scope.orgId }),
            },
          })
        ),
        Effect.scoped
      );

      expect(sessionInfo.project.org.id).toBe('org_selected');
      expect(consumerProject.consumer_user_id).toBe('consumer-user-org_selected');
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    })
  );

  it.effect('rejects an account endpoint without data as an unreachable backend would', () =>
    Effect.gen(function* () {
      const error = yield* listOrganizations({ apiKey: 'uak_test' }).pipe(
        Effect.provide(TestLive()),
        Effect.scoped,
        Effect.flip
      );

      expect(error).toMatchObject({ _tag: '@composio/client/APIConnectionError' });
    })
  );
});

describe('ToolkitsTest', () => {
  const toolkitsData = {
    toolkits: [makeToolkitFixture('gmail', 'Gmail'), makeToolkitFixture('slack', 'Slack')],
  };

  it.effect.each([
    { name: 'ToolkitsTest', layer: ToolkitsTest(toolkitsData) },
    { name: 'TestLive', layer: TestLive({ toolkitsData }) },
  ])('serves the same catalog answers through $name', ({ layer }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const search = yield* repo.searchToolkits({ search: 'gma' });
      const missing = yield* repo.getToolkitDetailed('nope').pipe(Effect.flip);

      expect(search.items.map(toolkit => toolkit.slug)).toEqual(['gmail']);
      expect(missing).toMatchObject({ _tag: '@composio/client/NotFoundError', status: 404 });
    }).pipe(Effect.provide(layer), Effect.scoped)
  );

  it.effect('dies on a repository method another family serves', () =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const exit = yield* repo.listAuthConfigs({}).pipe(Effect.exit);

      expect(Exit.hasDies(exit)).toBe(true);
    }).pipe(Effect.provide(ToolkitsTest()))
  );
});

describe('ConnectedAccountsTest', () => {
  const authConfig = (id: string, toolkitSlug: string): AuthConfigItem => ({
    id,
    name: id,
    no_of_connections: 0,
    status: 'ENABLED',
    type: 'default',
    uuid: `uuid-${id}`,
    toolkit: { logo: '', slug: toolkitSlug },
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_enabled_for_tool_router: true,
    created_at: '2026-01-01T00:00:00Z',
  });
  const connectedAccount: ConnectedAccountItem = {
    id: 'con_gmail',
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'default',
    toolkit: { slug: 'gmail' },
    auth_config: {
      id: 'ac_gmail',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    test_request_endpoint: '',
  };
  const input = {
    authConfigsData: { items: [authConfig('ac_gmail', 'gmail'), authConfig('ac_slack', 'slack')] },
    connectedAccountsData: { items: [connectedAccount] },
  };

  it.effect.each([
    { name: 'ConnectedAccountsTest', layer: ConnectedAccountsTest(input) },
    { name: 'TestLive', layer: TestLive(input) },
  ])('serves the same auth-config and connected-account answers through $name', ({ layer }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const authConfigs = yield* repo.listAuthConfigs({ toolkit_slug: 'slack' });
      const found = yield* repo.getConnectedAccount('con_gmail');
      const missing = yield* repo.getAuthConfig('ac_nope').pipe(Effect.flip);

      expect(authConfigs.items.map(item => item.id)).toEqual(['ac_slack']);
      expect(found.toolkit.slug).toBe('gmail');
      expect(missing).toMatchObject({ _tag: '@composio/client/NotFoundError', status: 404 });
    }).pipe(Effect.provide(layer), Effect.scoped)
  );

  it.effect('dies on a repository method another family serves', () =>
    Effect.gen(function* () {
      const repo = yield* ComposioToolkitsRepository;
      const exit = yield* repo.getToolkits().pipe(Effect.exit);

      expect(Exit.hasDies(exit)).toBe(true);
    }).pipe(Effect.provide(ConnectedAccountsTest()))
  );
});

// The runner doubles never spawn; a spawner that dies on use proves it.
const noSpawn = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die('a runner double spawned a process'))
);
const failingRunner = CommandRunner.of({
  run: () => Effect.succeed(3),
  capture: () => Effect.succeed({ exitCode: 3, stdout: 'out', stderr: 'err' }),
});

describe('CommandRunnerTest', () => {
  const command = ChildProcess.make('false');

  it.effect.each([
    { name: 'CommandRunnerTest', layer: CommandRunnerTest() },
    { name: 'TestLive', layer: TestLive() },
  ])('exits 0 with empty output without spawning through $name', ({ layer }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner;
      const exitCode = yield* runner.run(command);
      const captured = yield* runner.capture(command);

      expect(exitCode).toBe(0);
      expect(captured).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    }).pipe(Effect.provide(Layer.merge(layer, noSpawn)), Effect.scoped)
  );

  it.effect.each([
    { name: 'CommandRunnerTest', layer: CommandRunnerTest(failingRunner) },
    { name: 'TestLive', layer: TestLive({ commandRunner: failingRunner }) },
  ])('answers with the runner the test passes through $name', ({ layer }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner;
      const captured = yield* runner.capture(command);

      expect(captured).toEqual({ exitCode: 3, stdout: 'out', stderr: 'err' });
    }).pipe(Effect.provide(Layer.merge(layer, noSpawn)), Effect.scoped)
  );
});

describe('SetupTest', () => {
  // `SetupSkillInstallerShape` names the services the real installer reads; the doubles read none.
  const withInstallerServices = (layer: ReturnType<typeof SetupTest>) =>
    Layer.mergeAll(
      layer,
      BunFileSystem.layer,
      BunPath.layer,
      FetchHttpClient.layer,
      NodeOs.Default,
      TerminalUITest
    );
  const readyInstaller = SetupSkillInstaller.of({
    isClaudeSkillReady: Effect.succeed(true),
    hasManagedClaudeSkill: Effect.succeed(true),
    ensureClaudeSkill: Effect.succeed(false),
    removeClaudeSkill: Effect.succeed(true),
  });

  it.effect.each([
    { name: 'SetupTest', layer: withInstallerServices(SetupTest()) },
    { name: 'TestLive', layer: TestLive() },
  ])('installs no Claude skill and changes nothing, however often, through $name', ({ layer }) =>
    Effect.gen(function* () {
      const installer = yield* SetupSkillInstaller;
      const answers = yield* Effect.all([
        installer.ensureClaudeSkill,
        installer.ensureClaudeSkill,
        installer.isClaudeSkillReady,
        installer.hasManagedClaudeSkill,
        installer.removeClaudeSkill,
      ]);

      expect(answers).toEqual([false, false, false, false, false]);
    }).pipe(Effect.provide(layer), Effect.scoped)
  );

  it.effect.each([
    {
      name: 'SetupTest',
      layer: withInstallerServices(
        SetupTest({ commandRunner: failingRunner, setupSkillInstaller: readyInstaller })
      ),
    },
    {
      name: 'TestLive',
      layer: TestLive({ commandRunner: failingRunner, setupSkillInstaller: readyInstaller }),
    },
  ])('answers with the runner and installer the test passes through $name', ({ layer }) =>
    Effect.gen(function* () {
      const installer = yield* SetupSkillInstaller;
      const runner = yield* CommandRunner;
      const ready = yield* installer.isClaudeSkillReady;
      const exitCode = yield* runner.run(ChildProcess.make('claude', ['--version']));

      expect(ready).toBe(true);
      expect(exitCode).toBe(3);
    }).pipe(Effect.provide(Layer.merge(layer, noSpawn)), Effect.scoped)
  );
});
