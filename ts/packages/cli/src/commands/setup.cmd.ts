import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import {
  detectSetupTargets,
  inspectSetupTargets,
  installSetupTargets,
  isSetupPluginReady,
  isSetupReady,
  SETUP_TARGETS,
  uninstallSetupTargets,
  type AgentHost,
  type SetupTarget,
} from 'src/services/setup';
import { TerminalUI } from 'src/services/terminal-ui';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
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

const uninstall = Options.boolean('uninstall').pipe(
  Options.withDefault(false),
  Options.withDescription('Uninstall Composio plugins instead of installing them')
);

const TARGET_LABELS: Readonly<Record<AgentHost, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const formatTargets = (targets: ReadonlyArray<AgentHost>): string =>
  targets.map(target => TARGET_LABELS[target]).join(' and ');

const setupBaseCmd = Command.make(
  'setup',
  { target, yes, ifPresent, uninstall },
  ({ target, yes, ifPresent, uninstall }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      yield* ui.intro(uninstall ? 'composio setup --uninstall' : 'composio setup');

      const detections = yield* detectSetupTargets(target);
      const detected = detections.filter(result => result.available).map(result => result.target);
      const supported = detections.filter(result => result.available && result.supported);
      const unsupported = detections.filter(result => result.available && !result.supported);
      const notDetected = detections
        .filter(result => !result.available)
        .map(result => result.target);

      if (detected.length > 0) {
        yield* ui.log.success(`${formatTargets(detected)} detected.`);
      }
      if (notDetected.length > 0) {
        yield* ui.log.info(`${formatTargets(notDetected)} not detected.`);
      }
      if (target === 'all' && notDetected.length > 0) {
        return yield* Effect.fail(
          new Error(
            `\`--target all\` requires Claude Code and Codex. Missing: ${formatTargets(notDetected)}. Install the missing agent host, or use \`--target auto\` to operate on detected hosts only.`
          )
        );
      }
      if (unsupported.length > 0) {
        const reason = unsupported
          .map(result => result.unsupportedReason)
          .filter((message): message is string => Boolean(message))
          .join(' ');
        if (target !== 'auto' || supported.length === 0) {
          return yield* Effect.fail(new Error(reason));
        }
        yield* ui.log.warn(
          `${formatTargets(unsupported.map(result => result.target))} plugin setup skipped. ${reason}`
        );
      }
      if (detected.length === 0) {
        if (target === 'claude' || target === 'codex') {
          return yield* Effect.fail(
            new Error(
              `${target} is not installed or not available on PATH. Install it and rerun \`composio setup${uninstall ? ' --uninstall' : ''} --target ${target}\`.`
            )
          );
        }
        if (!ifPresent || target !== 'auto') {
          return yield* Effect.fail(
            new Error(
              `No supported agent host was detected. Install Claude Code or Codex, then rerun \`composio setup${uninstall ? ' --uninstall' : ''}\`.`
            )
          );
        }
        yield* ui.outro(
          `No supported agent host detected; plugin ${uninstall ? 'uninstall' : 'setup'} skipped.`
        );
        return;
      }

      const inspected = yield* inspectSetupTargets(detections, {
        allowMarketplaceConflict: uninstall,
      });
      if (uninstall) {
        const installed = inspected.filter(status => status.plugin_installed);
        const notInstalled = inspected.filter(status => !status.plugin_installed);
        const skillInstaller = yield* SetupSkillInstaller;
        const hasManagedClaudeSkill = inspected.some(status => status.target === 'claude')
          ? yield* skillInstaller.hasManagedClaudeSkill
          : false;
        const removable = inspected.filter(
          status => status.plugin_installed || (status.target === 'claude' && hasManagedClaudeSkill)
        );

        for (const status of installed) {
          yield* ui.log.success(
            `The Composio plugin for ${TARGET_LABELS[status.target]} is installed.`
          );
        }
        for (const status of notInstalled) {
          yield* ui.log.info(
            `The Composio plugin for ${TARGET_LABELS[status.target]} is not installed.`
          );
        }

        if (!yes && removable.length > 0) {
          if (!isInteractiveTerminal()) {
            return yield* Effect.fail(
              new Error('Non-interactive uninstall requires `--yes` to approve local changes.')
            );
          }
          const confirmed = yield* ui.confirm(
            `Remove Composio from ${formatTargets(removable.map(status => status.target))}?`,
            { defaultValue: false }
          );
          if (!confirmed) {
            yield* ui.outro('Uninstall cancelled.');
            return;
          }
        }

        const results = yield* uninstallSetupTargets(inspected);
        for (const result of results) {
          if (!result.plugin_changed) continue;
          yield* ui.log.success(
            `Successfully uninstalled the Composio plugin for ${TARGET_LABELS[result.target]}.`
          );
        }
        yield* ui.outro('Composio plugin uninstall complete.');
        return;
      }

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
      if (!yes) {
        if (!isInteractiveTerminal()) {
          return yield* Effect.fail(
            new Error('Non-interactive setup requires `--yes` to approve local changes.')
          );
        }

        const prompt =
          pendingPlugins.length === pending.length
            ? `Install the Composio plugin for ${formatTargets(pendingPlugins.map(status => status.target))}?`
            : `Finish Composio setup for ${formatTargets(pending.map(status => status.target))}?`;
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
  Command.withDescription('Install or uninstall Composio plugins for supported agent hosts.')
);
