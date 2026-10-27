import { describe, expect, it, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Effect, Exit, FileSystem, Path } from 'effect';
import { buildRootCommand } from 'src/commands';
import { CommandInputError } from 'src/commands/errors';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ProjectResolutionError } from 'src/services/command-project';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { NodeProcess } from 'src/services/node-process';
import { ComposioUserContext } from 'src/services/user-context';
import {
  cli,
  cliExit,
  MockConsole,
  recordedInvocationCalls,
  resetInvocationCalls,
  TestLive,
} from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { makeOrgProject } from 'test/__utils__/models/account';

const SHARED_PROJECT_DESCRIPTION =
  'Developer project to use instead of the one configured in this directory';
const SHARED_USER_DESCRIPTION =
  'User id to act as or filter by. Commands that act as a user default to the project test user id, then the global one.';
// `dev logs tools|triggers` declare a comma-separated `--user-id` filter of their own, which
// `withSharedFlags` accepts below a group entry and the help page shows in place of the shared row.
const OWN_USER_ID_PAGES = ['dev logs tools', 'dev logs triggers'];

// A fresh layer per page: the mock console keeps every line written under one layer.
const helpPage = (path: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* Effect.exit(cli([...path, '--help']));
    return (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join('\n');
  }).pipe(Effect.provide(TestLive()));

const subcommandPaths = (
  command: import('effect/cli').Command.Command.Any,
  prefix: ReadonlyArray<string>
): ReadonlyArray<ReadonlyArray<string>> =>
  command.subcommands
    .flatMap(group => group.commands)
    .filter(child => child.name !== 'help' && !child.unlisted)
    .flatMap(child => {
      const path = [...prefix, child.name];
      return [path, ...subcommandPaths(child, path)];
    });

const root = buildRootCommand({ isDevModeEnabled: true, isExperimentalFeatureEnabled: () => true });
const devCommand = root.subcommands.flatMap(group => group.commands).find(c => c.name === 'dev')!;
const devPages = subcommandPaths(devCommand, ['dev']).map(path => ({ path, name: path.join(' ') }));
const rootPages = subcommandPaths(root, [])
  .filter(path => path[0] !== 'dev' && path[0] !== 'listen')
  .map(path => ({ path, name: path.join(' ') }));

describe('CommandSurface: the dev group shares --user-id and --project-name', () => {
  it.effect.each(devPages)('documents both shared flags once on `$name`', ({ path, name }) =>
    Effect.gen(function* () {
      const page = yield* helpPage(path);
      const rows = page.split('\n').filter(line => line.trimStart().startsWith('--'));
      expect(
        rows.filter(row => row.includes('--project-name string')),
        name
      ).toHaveLength(1);
      expect(
        rows.filter(row => row.includes('--user-id string')),
        name
      ).toHaveLength(1);
      expect(page, name).toContain(SHARED_PROJECT_DESCRIPTION);
      if (!OWN_USER_ID_PAGES.includes(name)) {
        expect(page, name).toContain(SHARED_USER_DESCRIPTION);
      }
    })
  );

  it.effect.each(rootPages)('keeps the shared flags off the root page `$name`', ({ path }) =>
    Effect.gen(function* () {
      const page = yield* helpPage(path);
      expect(page).not.toContain('--user-id');
      expect(page).not.toContain('--project-name');
    })
  );

  layer(TestLive())(it => {
    it.effect('rejects --user-id on a root command, which has no such flag', () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(cli(['search', 'send an email', '--user-id', 'alice']));
        expect(result._tag).toBe('Failure');
        const stderr = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' })).join(
          '\n'
        );
        expect(stderr).toContain('--user-id');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: {
          COMPOSIO_USER_API_KEY: 'test_api_key',
          COMPOSIO_ORG_ID: 'dev_org_test',
          COMPOSIO_PROJECT_ID: 'dev_project_test',
        },
      }),
      connectedAccountsData: {
        items: ['alice', 'bob'].map(userId => ({
          id: `con_${userId}`,
          status: 'ACTIVE',
          status_reason: null,
          is_disabled: false,
          user_id: userId,
          toolkit: { slug: 'gmail' },
          auth_config: {
            id: 'ac_gmail',
            auth_scheme: 'OAUTH2',
            is_composio_managed: true,
            is_disabled: false,
          },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          test_request_endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        })),
      },
    })
  )(it => {
    it.effect.each([
      {
        name: 'after the subcommand',
        args: ['dev', 'connected-accounts', 'list', '--user-id', 'alice'],
      },
      {
        name: 'before the subcommand',
        args: ['dev', '--user-id', 'alice', 'connected-accounts', 'list'],
      },
    ])('reaches the handler when passed $name', ({ args }) =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(args);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('con_alice');
        expect(output).not.toContain('con_bob');
      })
    );
  });
});

describe('CommandSurface: --project-name reaches the project resolver', () => {
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
      }),
      accountData: { projects: [] },
    })
  )(it => {
    it.effect.each(
      [
        {
          name: 'after the subcommand',
          args: ['dev', 'connected-accounts', 'link', 'gmail', '--list', '--project-name', 'nope'],
        },
        {
          name: 'before the subcommand',
          args: ['dev', '--project-name', 'nope', 'connected-accounts', 'link', 'gmail', '--list'],
        },
        { name: 'to connected-accounts list', args: ['dev', 'connected-accounts', 'list'] },
        { name: 'to toolkits info', args: ['dev', 'toolkits', 'info', 'gmail'] },
        { name: 'to triggers listen', args: ['dev', 'triggers', 'listen'] },
        { name: 'to listen', args: ['dev', 'listen'] },
      ].map(({ name, args }) =>
        args.includes('--project-name')
          ? { name, args }
          : { name, args: [...args, '--project-name', 'nope'] }
      )
    )('looks the named project up when passed $name', ({ args }) =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        const error = yield* Effect.flip(cli(args));
        expect(error).toBeInstanceOf(ProjectResolutionError);
        expect((error as ProjectResolutionError).message).toContain(
          'Developer project "nope" was not found in org "org_test"'
        );
      })
    );
  });
});

describe('CommandSurface: toolkits list reports the named project it cannot find', () => {
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
      }),
      accountData: { projects: [] },
    })
  )(it => {
    // `toolkits list` prints every failure on stderr itself, then fails already reported.
    it.effect('looks the named project up', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        const exit = yield* Effect.exit(cli(['dev', 'toolkits', 'list', '--project-name', 'nope']));
        const stderr = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' })).join(
          '\n'
        );
        expect(stderr).toContain('Developer project "nope" was not found in org "org_test"');
        expect(exitCodeOf(exit)).toBe(1);
      })
    );
  });
});

describe('CommandSurface: playground-execute --parallel keeps the shared flags', () => {
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
      }),
      accountData: { projects: [] },
    })
  )(it => {
    it.effect.each([
      {
        name: 'after the subcommand',
        args: ['dev', 'playground-execute', '--parallel', 'GMAIL_SEND_EMAIL', '-d', '{}'],
        shared: ['--project-name', 'nope'],
      },
      {
        name: 'before the subcommand',
        args: ['dev', '--project-name', 'nope', 'playground-execute', '--parallel'],
        shared: ['GMAIL_SEND_EMAIL', '-d', '{}'],
      },
    ])('looks the named project up when --project-name is passed $name', ({ args, shared }) =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        const error = yield* Effect.flip(cli([...args, ...shared, '--skip-checks']));
        expect(error).toBeInstanceOf(ProjectResolutionError);
        expect((error as ProjectResolutionError).message).toContain(
          'Developer project "nope" was not found in org "org_test"'
        );
      })
    );
  });

  const sessionUserIds: Array<string> = [];
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: {
          COMPOSIO_USER_API_KEY: 'test_api_key',
          COMPOSIO_ORG_ID: 'dev_org_test',
          COMPOSIO_PROJECT_ID: 'dev_project_test',
        },
      }),
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolRouter: {
        create: params =>
          Effect.sync(() => {
            sessionUserIds.push(params.user_id);
            return {
              session_id: 'trs_test_session',
              config: {
                user_id: params.user_id,
                execute: {},
                search: {},
                preload: { tools: [] },
                instant: false,
              },
              config_version: 1,
              mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
              tool_router_tools: [],
            };
          }),
      },
    })
  )(it => {
    it.effect('runs as the --user-id passed before the subcommand', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        sessionUserIds.length = 0;
        yield* cli([
          'dev',
          '--user-id',
          'alice',
          'playground-execute',
          '--parallel',
          '--skip-checks',
          'GMAIL_SEND_EMAIL',
          '-d',
          '{}',
          'GITHUB_CREATE_ISSUE',
          '-d',
          '{}',
        ]);
        expect(sessionUserIds.length).toBeGreaterThan(0);
        expect(new Set(sessionUserIds)).toEqual(new Set(['alice']));
      })
    );
  });
});

describe('CommandSurface: playground-execute --parallel finds its command name', () => {
  const executedSlugs: Array<string> = [];
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: {
          COMPOSIO_USER_API_KEY: 'test_api_key',
          COMPOSIO_ORG_ID: 'dev_org_test',
          COMPOSIO_PROJECT_ID: 'dev_project_test',
        },
      }),
      stdin: { isTTY: true, data: '' },
      accountData: {
        projects: [
          makeOrgProject({ id: 'proj_pe', name: 'playground-execute', orgId: 'org_test' }),
        ],
      },
      toolsExecutor: { onExecute: slug => executedSlugs.push(slug) },
    })
  )(it => {
    it.effect.each([
      { flag: '--user-id', args: ['--user-id', 'playground-execute'] },
      { flag: '--project-name', args: ['--project-name', 'playground-execute'] },
    ])('does not take a $flag value that spells it for the command', ({ args }) =>
      Effect.gen(function* () {
        yield* (yield* ComposioUserContext).login('test_api_key', 'org_test', 'global_user');
        executedSlugs.length = 0;
        yield* cli([
          'dev',
          ...args,
          'playground-execute',
          '--parallel',
          '--skip-checks',
          'GMAIL_SEND_EMAIL',
          '-d',
          '{}',
          'GITHUB_CREATE_ISSUE',
          '-d',
          '{}',
        ]);
        expect(executedSlugs.toSorted()).toEqual(['GITHUB_CREATE_ISSUE', 'GMAIL_SEND_EMAIL']);
      })
    );
  });
});

// `dev logs tools|triggers` honor --user-id as their filter and reject only --project-name.
// `declaredBy` is the registration that declares a flag unsupported for every command under it:
// the message names it, while the failure is recorded against the command that ran.
const rejectingCommands = [
  { command: ['init'], args: [], flags: ['--project-name', '--user-id'] },
  { command: ['logs', 'tools'], declaredBy: 'dev logs', args: [], flags: ['--project-name'] },
  { command: ['logs', 'triggers'], declaredBy: 'dev logs', args: [], flags: ['--project-name'] },
  {
    command: ['auth-configs', 'list'],
    declaredBy: 'dev auth-configs',
    args: [],
    flags: ['--project-name', '--user-id'],
  },
  {
    command: ['projects', 'list'],
    declaredBy: 'dev projects',
    args: [],
    flags: ['--project-name', '--user-id'],
  },
  { command: ['toolkits', 'search'], args: ['email'], flags: ['--project-name', '--user-id'] },
  { command: ['toolkits', 'version'], args: ['gmail'], flags: ['--project-name', '--user-id'] },
  {
    command: ['connected-accounts', 'info'],
    args: ['ca_1'],
    flags: ['--project-name', '--user-id'],
  },
  {
    command: ['connected-accounts', 'whoami'],
    args: ['ca_1'],
    flags: ['--project-name', '--user-id'],
  },
  { command: ['triggers', 'list'], args: ['gmail'], flags: ['--project-name', '--user-id'] },
  {
    command: ['triggers', 'info'],
    args: ['GMAIL_NEW_GMAIL_MESSAGE'],
    flags: ['--project-name', '--user-id'],
  },
  { command: ['triggers', 'status'], args: [], flags: ['--project-name', '--user-id'] },
  { command: ['triggers', 'create'], args: ['GMAIL_NEW_GMAIL_MESSAGE'], flags: ['--project-name'] },
  { command: ['triggers', 'enable'], args: ['ti_1'], flags: ['--project-name', '--user-id'] },
  { command: ['triggers', 'disable'], args: ['ti_1'], flags: ['--project-name', '--user-id'] },
].flatMap(({ command, declaredBy, args, flags }) =>
  flags.flatMap(flag =>
    (['before', 'after'] as const).map(position => {
      const path = ['dev', ...command].join(' ');
      return {
        argv:
          position === 'before'
            ? ['dev', flag, 'other', ...command, ...args]
            : ['dev', ...command, ...args, flag, 'other'],
        flag,
        path,
        declaredBy: declaredBy ?? path,
        name: `${path} ${flag} (${position} the command)`,
      };
    })
  )
);

const rejectionMessage = (command: string, flag: string) =>
  flag === '--project-name'
    ? `\`composio ${command}\` cannot target another project yet. Remove --project-name, or run it from that project's directory.`
    : `\`composio ${command}\` does not act as a user. Remove --user-id.`;

describe('CommandSurface: dev commands that cannot honor a shared flag reject it', () => {
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnv({
        env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
      }),
    })
  )(it => {
    it.effect.each(rejectingCommands)('rejects `$name`', ({ argv, flag, path, declaredBy }) =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* resetInvocationCalls;
        const { exit, exitCode } = yield* cliExit(argv);
        expect(exitCode).toBe(1);
        const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
        expect(error).toBeInstanceOf(CommandInputError);
        expect(error).toMatchObject({
          command: declaredBy,
          option: flag,
          message: rejectionMessage(declaredBy, flag),
        });
        const lifecycle = (yield* recordedInvocationCalls).flatMap(call =>
          call.service === 'CommandLifecycleTelemetry' && call.event !== 'pluginHintShown'
            ? [`${call.event} ${call.context.commandPath}`]
            : []
        );
        expect(lifecycle).toEqual([`invoked ${path}`, `failed ${path}`]);
      })
    );
  });
});

describe('CommandSurface: the developer-mode toggle rejects the shared flags', () => {
  // A fresh layer per case: a toggle that went through would turn developer mode off, and the
  // next case would then parse without the shared flags.
  it.effect.each([
    { args: ['dev', '--mode', 'off', '--project-name', 'other'], flag: '--project-name' },
    { args: ['dev', '--user-id', 'alice', '--mode', 'off'], flag: '--user-id' },
  ])('rejects `$args` and keeps developer mode on', ({ args, flag }) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(cli(args));
      expect(error).toBeInstanceOf(CommandInputError);
      expect(error).toMatchObject({ command: 'dev', option: flag });
      expect((yield* ComposioCliUserConfig).isDevModeEnabled()).toBe(true);
    }).pipe(Effect.provide(TestLive()), Effect.scoped)
  );

  it.effect('still toggles without them', () =>
    Effect.gen(function* () {
      yield* cli(['dev', '--mode', 'off']);
      expect((yield* ComposioCliUserConfig).isDevModeEnabled()).toBe(false);
    }).pipe(Effect.provide(TestLive()), Effect.scoped)
  );
});

describe('CommandSurface: a named project does not borrow the directory test user', () => {
  // The directory belongs to `dir-project` and configures its own test user; the global one is
  // what login stores. A `--project-name` naming another project must fall back to the global one.
  const writeDirectoryProject = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { cwd } = yield* NodeProcess;
    yield* fs.makeDirectory(path.join(cwd, '.composio'), { recursive: true });
    yield* fs.writeFileString(
      path.join(cwd, '.composio', 'project.json'),
      JSON.stringify({ org_id: 'org_test', project_id: 'proj_dir', test_user_id: 'directory_user' })
    );
  });

  const sessionUser = (args: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const userIds: Array<string> = [];
      yield* Effect.gen(function* () {
        yield* writeDirectoryProject;
        yield* (yield* ComposioUserContext).login('test_api_key', 'org_test', 'global_user');
        yield* Effect.exit(cli(args));
      }).pipe(
        Effect.provide(
          TestLive({
            baseConfigProvider: ConfigProvider.fromEnv({
              env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
            }),
            accountData: { projects },
            stdin: { isTTY: true, data: '' },
            toolRouter: {
              create: params =>
                Effect.sync(() => {
                  userIds.push(params.user_id);
                  return {
                    session_id: 'trs_test_session',
                    config: {
                      user_id: params.user_id,
                      execute: {},
                      search: {},
                      preload: { tools: [] },
                      instant: false,
                    },
                    config_version: 1,
                    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                    tool_router_tools: [],
                  };
                }),
            },
          })
        ),
        Effect.scoped
      );
      return [...new Set(userIds)];
    });

  const projects = [
    makeOrgProject({ id: 'proj_dir', name: 'dir-project', orgId: 'org_test' }),
    makeOrgProject({ id: 'proj_other', name: 'other-project', orgId: 'org_test' }),
  ];
  const sessionCommands = [
    { command: 'toolkits list', args: ['dev', 'toolkits', 'list'] },
    { command: 'toolkits info', args: ['dev', 'toolkits', 'info', 'gmail'] },
    {
      command: 'playground-execute',
      args: ['dev', 'playground-execute', 'GMAIL_SEND_EMAIL', '-d', '{}', '--skip-checks'],
    },
  ];
  const projectCases = [
    { project: ['--project-name', 'other-project'], expected: 'global_user' },
    { project: ['--project-name', 'dir-project'], expected: 'directory_user' },
    { project: [], expected: 'directory_user' },
  ];

  it.effect.each(
    sessionCommands.flatMap(({ command, args }) =>
      projectCases.map(({ project, expected }) => ({
        args: [...args, ...project],
        expected,
        name: `${command} ${project.join(' ') || 'without --project-name'}`,
      }))
    )
  )('`$name` opens its session as $expected', ({ args, expected }) =>
    Effect.gen(function* () {
      expect(yield* sessionUser(args)).toEqual([expected]);
    })
  );

  const accountFor = (userId: string, id: string): ConnectedAccountItem => ({
    id,
    alias: id,
    word_id: id,
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: userId,
    toolkit: { slug: 'gmail' },
    auth_config: {
      id: 'ac_gmail_oauth',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    test_request_endpoint: '',
  });

  // `link --list` without --project-name resolves the consumer project and its own user, so only
  // the named cases apply.
  it.effect.each([
    { project: 'other-project', expected: 'ca_global', other: 'ca_dir' },
    { project: 'dir-project', expected: 'ca_dir', other: 'ca_global' },
  ])(
    '`connected-accounts link --list --project-name $project` lists $expected',
    ({ project, expected, other }) =>
      Effect.gen(function* () {
        yield* writeDirectoryProject;
        yield* (yield* ComposioUserContext).login('test_api_key', 'org_test', 'global_user');
        yield* cli([
          'dev',
          'connected-accounts',
          'link',
          'gmail',
          '--list',
          '--project-name',
          project,
        ]);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain(expected);
        expect(output).not.toContain(other);
      }).pipe(
        Effect.provide(
          TestLive({
            baseConfigProvider: ConfigProvider.fromEnv({
              env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
            }),
            accountData: { projects },
            connectedAccountsData: {
              items: [
                accountFor('global_user', 'ca_global'),
                accountFor('directory_user', 'ca_dir'),
              ],
            },
          })
        ),
        Effect.scoped
      )
  );

  it.effect.each([
    { project: 'other-project', expected: 'Using global test user id "global_user"' },
    { project: 'dir-project', expected: 'Using test user id "directory_user"' },
  ])(
    '`connected-accounts link --auth-config --project-name $project` warns `$expected`',
    ({ project, expected }) =>
      Effect.gen(function* () {
        yield* writeDirectoryProject;
        yield* (yield* ComposioUserContext).login('test_api_key', 'org_test', 'global_user');
        yield* Effect.exit(
          cli([
            'dev',
            'connected-accounts',
            'link',
            '--auth-config',
            'ac_gmail_oauth',
            '--no-wait',
            '--project-name',
            project,
          ])
        );
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain(expected);
      }).pipe(
        Effect.provide(
          TestLive({
            baseConfigProvider: ConfigProvider.fromEnv({
              env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
            }),
            accountData: { projects },
          })
        ),
        Effect.scoped
      )
  );
  // A login without session info stores no global test user; the directory's does not carry over.
  it.effect.each([
    {
      command: 'playground-execute',
      args: ['dev', 'playground-execute', 'GMAIL_SEND_EMAIL', '-d', '{}', '--skip-checks'],
    },
    {
      command: 'connected-accounts link --list',
      args: ['dev', 'connected-accounts', 'link', 'gmail', '--list'],
    },
    {
      command: 'connected-accounts link --auth-config',
      args: ['dev', 'connected-accounts', 'link', '--auth-config', 'ac_gmail_oauth', '--no-wait'],
    },
  ])('`$command --project-name` without any test user points at --user-id and login', ({ args }) =>
    Effect.gen(function* () {
      yield* writeDirectoryProject;
      yield* (yield* ComposioUserContext).login('test_api_key', 'org_test');
      const error = yield* Effect.flip(cli([...args, '--project-name', 'other-project']));
      expect(error).toMatchObject({
        message:
          'Missing user id. Provide --user-id, or run `composio login` to store a global test user id.',
      });
    }).pipe(
      Effect.provide(
        TestLive({
          baseConfigProvider: ConfigProvider.fromEnv({
            env: { COMPOSIO_USER_API_KEY: 'test_api_key', COMPOSIO_ORG_ID: 'org_test' },
          }),
          accountData: { projects },
          stdin: { isTTY: true, data: '' },
        })
      ),
      Effect.scoped
    )
  );
});
