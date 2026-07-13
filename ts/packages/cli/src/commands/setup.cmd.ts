import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import {
  inspectSetupTargets,
  installSetupTargets,
  resolveSetupTargets,
  SETUP_TARGETS,
  type SetupTarget,
} from 'src/services/setup';
import { TerminalUI } from 'src/services/terminal-ui';

const target = Options.choice('target', SETUP_TARGETS).pipe(
  Options.withDefault('auto' as SetupTarget),
  Options.withDescription('Agent host to configure: auto, claude, codex, or all')
);

const yes = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Accept setup changes without prompting')
);

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print machine-readable JSON')
);

const setupStatusCmd = Command.make('status', { json }).pipe(
  Command.withDescription('Inspect agent plugin installation status.'),
  Command.withHandler(({ json }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const targets = yield* inspectSetupTargets;
      const result = { targets };

      if (!json) {
        yield* ui.note(
          [
            ...targets.map(item => {
              const state = !item.available
                ? 'not detected'
                : !item.plugin_installed
                  ? 'not installed'
                  : item.plugin_enabled
                    ? 'installed and enabled'
                    : 'installed but disabled';
              return `${item.target}: ${state}`;
            }),
            ...targets
              .filter(item => item.available)
              .map(
                item => `${item.target} CLI skill: ${item.cli_skill_ready ? 'ready' : 'not ready'}`
              ),
          ].join('\n'),
          'Composio setup status'
        );
      }
      yield* ui.output(JSON.stringify(result), { force: json });
    })
  )
);

const setupBaseCmd = Command.make('setup', { target, yes }, ({ target, yes }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* ui.intro('composio setup');

    const targets = yield* resolveSetupTargets(target);
    if (!yes) {
      const confirmed = yield* ui.confirm(`Install Composio for ${targets.join(' and ')}?`, {
        defaultValue: true,
      });
      if (!confirmed) {
        yield* ui.outro('Setup cancelled.');
        return;
      }
    }

    const results = yield* installSetupTargets(targets);
    for (const result of results) {
      yield* ui.log.success(
        result.plugin_changed
          ? `Configured and enabled the Composio plugin for ${result.target}.`
          : `The Composio plugin for ${result.target} is already installed and enabled.`
      );
      if (result.target === 'claude') {
        yield* ui.log.success(
          result.skill_changed
            ? 'Installed the composio-cli skill for Claude Code.'
            : 'The composio-cli skill for Claude Code is already installed.'
        );
      } else {
        yield* ui.log.success('The Codex plugin includes the composio-cli skill.');
      }
    }

    yield* ui.output(
      JSON.stringify({
        success: true,
        targets: results,
      })
    );
    yield* ui.outro('Composio setup complete.');
  })
);

export const setupCmd = setupBaseCmd.pipe(
  Command.withDescription('Install Composio plugins for supported agent hosts.'),
  Command.withSubcommands([setupStatusCmd])
);
