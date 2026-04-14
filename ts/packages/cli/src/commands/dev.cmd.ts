import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { initCmd } from './init.cmd';
import { triggersCmd$Listen } from './triggers/commands/triggers.listen.cmd';
import { logsCmd } from './logs-cmd/logs.cmd';
import { devToolsCmd$Execute } from './tools/commands/tools.execute.cmd';
import { toolkitsCmd } from './toolkits/toolkits.cmd';
import { authConfigsCmd } from './auth-configs/auth-configs.cmd';
import { connectedAccountsCmd } from './connected-accounts/connected-accounts.cmd';
import { triggersCmd } from './triggers/triggers.cmd';
import { projectsCmd } from './projects/projects.cmd';
import { ComposioCliUserConfig, resolveCliConfigPathSync } from 'src/services/cli-user-config';
import { Stdin } from 'src/services/stdin';
import { TerminalUI } from 'src/services/terminal-ui';
import type { CommandVisibility } from './feature-tags';

const devMode = Options.choice('mode', ['on', 'off'] as const).pipe(
  Options.withDescription('Set developer mode on or off.'),
  Options.optional
);

const devSubcommands = [
  initCmd,
  devToolsCmd$Execute,
  triggersCmd$Listen,
  logsCmd,
  toolkitsCmd,
  authConfigsCmd,
  connectedAccountsCmd,
  triggersCmd,
  projectsCmd,
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
        yield* ui.log.error('Enabling developer mode requires an interactive terminal.');
        yield* ui.log.step(
          `Set "developer.enabled": true manually in ${resolveCliConfigPathSync()} if you really want to enable it outside an interactive session.`
        );
        return;
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
    yield* ui.log.step(`Config updated: ${resolveCliConfigPathSync()}`);
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

export const buildDevCommand = (visibility: CommandVisibility) => {
  const cmd = Command.make('dev', { devMode }).pipe(
    Command.withDescription(
      visibility.isDevModeEnabled
        ? 'Developer workflows: init, playground execution, logs, projects, toolkits, accounts, and triggers.'
        : 'Developer mode controls access to developer-only workflows. When off, only `composio dev --mode on|off` is available.'
    ),
    Command.withHandler(({ devMode }) =>
      Option.match(devMode, {
        onNone: () => promptForDeveloperMode(),
        onSome: value => applyDeveloperModeChange(value === 'on'),
      })
    )
  );

  return visibility.isDevModeEnabled ? cmd.pipe(Command.withSubcommands([...devSubcommands])) : cmd;
};
