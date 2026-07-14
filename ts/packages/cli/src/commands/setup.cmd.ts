import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import {
  detectSetupTargets,
  inspectSetupTargets,
  installSetupTargets,
  isSetupPluginReady,
  isSetupReady,
  SETUP_TARGETS,
  type AgentHost,
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

const TARGET_LABELS: Readonly<Record<AgentHost, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const formatTargets = (targets: ReadonlyArray<AgentHost>): string =>
  targets.map(target => TARGET_LABELS[target]).join(' and ');

const setupBaseCmd = Command.make(
  'setup',
  { target, yes, ifPresent },
  ({ target, yes, ifPresent }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      yield* ui.intro('composio setup');

      const detections = yield* detectSetupTargets(target);
      const detected = detections.filter(result => result.available).map(result => result.target);
      const notDetected = detections
        .filter(result => !result.available)
        .map(result => result.target);

      if (detected.length > 0) {
        yield* ui.log.success(`${formatTargets(detected)} detected.`);
      }
      if (notDetected.length > 0) {
        yield* ui.log.info(`${formatTargets(notDetected)} not detected.`);
      }
      if (detected.length === 0) {
        if (!ifPresent || target !== 'auto') {
          return yield* Effect.fail(
            new Error(
              'No supported agent host was detected. Install Claude Code or Codex, then rerun `composio setup`.'
            )
          );
        }
        yield* ui.outro('No supported agent host detected; plugin setup skipped.');
        return;
      }

      const inspected = yield* inspectSetupTargets(detections);
      for (const status of inspected.filter(isSetupPluginReady)) {
        yield* ui.log.success(
          `The Composio plugin for ${TARGET_LABELS[status.target]} is already installed and enabled.`
        );
      }

      const pending = inspected.filter(status => !isSetupReady(status));
      if (pending.length === 0) {
        yield* ui.outro('Composio setup complete.');
        return;
      }

      const pendingPlugins = pending.filter(status => !isSetupPluginReady(status));
      if (!yes && pendingPlugins.length > 0) {
        if (!isInteractiveTerminal()) {
          return yield* Effect.fail(
            new Error('Non-interactive setup requires `--yes` to approve local changes.')
          );
        }

        const prompt = `Install the Composio plugin for ${formatTargets(pendingPlugins.map(status => status.target))}?`;
        const confirmed = yield* ui.confirm(prompt, { defaultValue: true });
        if (!confirmed) {
          yield* ui.outro('Setup cancelled.');
          return;
        }
      }

      const results = yield* installSetupTargets(pending);
      for (const result of results) {
        if (!result.plugin_changed) continue;

        const initial = pending.find(status => status.target === result.target)!;
        let action = 'configured and enabled';
        if (!initial.plugin_installed) action = 'installed and enabled';
        else if (!initial.plugin_enabled) action = 'enabled';
        yield* ui.log.success(
          `Successfully ${action} the Composio plugin for ${TARGET_LABELS[result.target]}.`
        );
      }

      yield* ui.outro('Composio setup complete.');
    })
);

export const setupCmd = setupBaseCmd.pipe(
  Command.withDescription('Install Composio plugins for supported agent hosts.')
);
