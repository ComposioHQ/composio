import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import {
  installSetupTargets,
  resolveSetupTargets,
  SETUP_TARGETS,
  type SetupTarget,
} from 'src/services/setup';
import { TerminalUI } from 'src/services/terminal-ui';
import { isInteractiveTerminal } from 'src/utils/stdio';

const target = Options.choice('target', SETUP_TARGETS).pipe(
  Options.withDefault('auto' as SetupTarget),
  Options.withDescription('Agent host to configure: auto, claude, codex, or all')
);

const yes = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Accept setup changes without prompting')
);

const ifPresent = Options.boolean('if-present').pipe(
  Options.withDefault(false),
  Options.withDescription('Exit successfully when automatic detection finds no supported host')
);

const setupBaseCmd = Command.make(
  'setup',
  { target, yes, ifPresent },
  ({ target, yes, ifPresent }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      yield* ui.intro('composio setup');

      if (!yes && !isInteractiveTerminal()) {
        return yield* Effect.fail(
          new Error('Non-interactive setup requires `--yes` to approve local changes.')
        );
      }

      const targets = yield* resolveSetupTargets(target, { allowEmpty: ifPresent });
      if (targets.length === 0) {
        yield* ui.outro('No supported agent host detected; plugin setup skipped.');
        return;
      }
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
        let pluginMessage = `The Composio plugin for ${result.target} is already installed and enabled.`;
        if (result.plugin_changed) {
          pluginMessage = `Configured and enabled the Composio plugin for ${result.target}.`;
        }
        yield* ui.log.success(pluginMessage);
      }

      yield* ui.outro('Composio setup complete.');
    })
);

export const setupCmd = setupBaseCmd.pipe(
  Command.withDescription('Install Composio plugins for supported agent hosts.')
);
