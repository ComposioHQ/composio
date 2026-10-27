import { withCommandMeta } from 'src/invocation/command-identity';
import { Command, Flag } from 'effect/cli';
import { Effect, Option } from 'effect';
import { CommandInputError } from './errors';
import { initCmd } from './init.cmd';
import { triggersCmd$Listen } from './triggers/commands/triggers.listen.cmd';
import { logsCmd } from './logs/logs.cmd';
import { devToolsCmd$Execute } from './tools/commands/tools.execute.cmd';
import { toolkitsCmd } from './toolkits/toolkits.cmd';
import { authConfigsCmd } from './auth-configs/auth-configs.cmd';
import { connectedAccountsCmd } from './connected-accounts/connected-accounts.cmd';
import { triggersCmd } from './triggers/triggers.cmd';
import { projectsCmd } from './projects/projects.cmd';
import { ComposioCliUserConfig, resolveCliConfigPath } from 'src/services/cli-user-config';
import { Stdin } from 'src/services/stdin';
import { TerminalUI } from 'src/services/terminal-ui';
import type { CommandVisibility } from './feature-tags';
import { CommandSurface, rejectSharedFlags, rejectsSharedFlags } from './surface';
import { withRegisteredSubcommands } from 'src/commands/registration';

const devMode = Flag.Literals('mode', ['on', 'off'] as const).pipe(
  Flag.withDescription('Set developer mode on or off.'),
  Flag.optional
);

/**
 * Flags every `dev` subcommand accepts, before or after the subcommand name.
 * A handler reads them through `CommandSurface`; a subcommand must not declare
 * a flag of the same name, `withSharedFlags` rejects the duplicate.
 */
const userId = Flag.String('user-id').pipe(
  Flag.optional,
  Flag.withDescription(
    'User id to act as or filter by. Commands that act as a user default to the project test user id, then the global one.'
  )
);

const projectName = Flag.String('project-name').pipe(
  Flag.optional,
  Flag.withDescription('Developer project to use instead of the one configured in this directory')
);

export const devSubcommands = [
  initCmd.pipe(rejectsSharedFlags('dev init')),
  devToolsCmd$Execute,
  triggersCmd$Listen.pipe(withCommandMeta({ requiresLogin: true })),
  logsCmd.pipe(rejectsSharedFlags('dev logs', ['--project-name'])),
  toolkitsCmd,
  authConfigsCmd.pipe(rejectsSharedFlags('dev auth-configs')),
  connectedAccountsCmd,
  triggersCmd,
  projectsCmd.pipe(rejectsSharedFlags('dev projects')),
] as const;

const describeCurrentMode = (enabled: boolean) =>
  enabled
    ? 'Developer mode is on. Developer subcommands are available.'
    : 'Developer mode is off. Only `composio dev --mode on|off` is available.';

const applyDeveloperModeChange = (enabled: boolean) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const stdin = yield* Stdin;
    const cliConfig = yield* ComposioCliUserConfig;
    const current = cliConfig.isDevModeEnabled();
    if (enabled === current) {
      yield* ui.log.info(describeCurrentMode(current));
      return;
    }

    if (enabled) {
      if (!stdin.isTTY()) {
        const configPath = yield* resolveCliConfigPath;
        return yield* new CommandInputError({
          command: 'dev',
          option: '--mode',
          message: `Enabling developer mode requires an interactive terminal. Set "developer.enabled": true in ${configPath} to enable it outside an interactive session.`,
        });
      }

      yield* ui.note(
        [
          'Developer mode is for engineers building with the CLI.',
          '',
          'It is powerful, but it unlocks more advanced commands like creating or updating auth configs and connected accounts.',
        ].join('\n'),
        'Warning'
      );
      const confirmed = yield* ui.confirm('Enable developer mode?', { defaultValue: false });
      if (!confirmed) {
        yield* ui.outro('Aborted.');
        return;
      }
    }

    yield* cliConfig.update({
      developer: {
        ...cliConfig.raw.developer,
        enabled,
      },
    });

    yield* ui.log.success(
      enabled
        ? 'Developer mode enabled.'
        : 'Developer mode disabled. Only `composio dev --mode on|off` remains available.'
    );
    const configPath = yield* resolveCliConfigPath;
    yield* ui.log.step(`Config updated: ${configPath}`);
  });

const promptForDeveloperMode = () =>
  Effect.gen(function* () {
    const cliConfig = yield* ComposioCliUserConfig;
    const stdin = yield* Stdin;
    const ui = yield* TerminalUI;
    const current = cliConfig.isDevModeEnabled();

    if (!stdin.isTTY()) {
      yield* ui.log.info(describeCurrentMode(current));
      yield* ui.log.step('Pass `--mode on` or `--mode off` to change developer mode.');
      return;
    }

    const next = yield* ui.select('Developer mode', [
      {
        value: 'off' as const,
        label: current ? 'Turn off' : 'Keep off',
        hint: 'Hide developer subcommands and block developer workflows.',
      },
      {
        value: 'on' as const,
        label: current ? 'Keep on' : 'Turn on',
        hint: 'Show developer subcommands after an interactive warning.',
      },
    ]);

    if ((next === 'on') === current) {
      yield* ui.log.info(describeCurrentMode(current));
      return;
    }

    yield* applyDeveloperModeChange(next === 'on');
  });

const developerModeHandler = ({ devMode }: { readonly devMode: Option.Option<'on' | 'off'> }) =>
  Option.match(devMode, {
    onNone: () => promptForDeveloperMode(),
    onSome: value => applyDeveloperModeChange(value === 'on'),
  });

const makeDevCommand = <E, R>(
  visibility: CommandVisibility,
  handler: (input: { readonly devMode: Option.Option<'on' | 'off'> }) => Effect.Effect<void, E, R>
) =>
  Command.make('dev', { devMode }).pipe(
    Command.withDescription(
      visibility.isDevModeEnabled
        ? 'Developer workflows: init, playground execution, logs, projects, toolkits, accounts, and triggers.'
        : 'Developer mode controls access to developer-only workflows. When off, only `composio dev --mode on|off` is available.'
    ),
    Command.withExamples([
      { command: 'composio dev --mode on' },
      { command: 'composio dev --mode off' },
    ]),
    Command.withHandler(handler)
  );

// The developer-mode toggle changes a global setting, for no user and no project.
const toggleRejections = {
  '--project-name':
    '`composio dev --mode` changes a global setting, so --project-name does not apply. Remove it.',
  '--user-id':
    '`composio dev --mode` changes a global setting, so --user-id does not apply. Remove it.',
};

export const buildDevCommand = (visibility: CommandVisibility) =>
  visibility.isDevModeEnabled
    ? makeDevCommand(visibility, input =>
        rejectSharedFlags('dev', undefined, toggleRejections).pipe(
          Effect.andThen(developerModeHandler(input))
        )
      ).pipe(
        withRegisteredSubcommands([...devSubcommands]),
        Command.withSharedFlags({ userId, projectName }),
        Command.provide(({ userId, projectName }) => CommandSurface.dev({ userId, projectName }))
      )
    : makeDevCommand(visibility, developerModeHandler);
