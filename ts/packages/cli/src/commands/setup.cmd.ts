import { Command, Options } from '@effect/cli';
import { Effect, Predicate } from 'effect';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import {
  getSetupCancelledEvent,
  getSetupHostDetectedEvent,
  getSetupSkippedEvent,
} from 'src/analytics/events';
import { APP_VERSION } from 'src/constants';
import { AGENT_HOST_LABELS } from 'src/services/agent-host';
import {
  detectSetupTargets,
  inspectSetupTargets,
  installSetupTargets,
  isSetupPluginReady,
  isSetupReady,
  SETUP_TARGETS,
  SetupCommandError,
  uninstallSetupTargets,
  type AgentHost,
} from 'src/services/setup';
import { TerminalUI } from 'src/services/terminal-ui';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { cliInvocationContext } from 'src/services/runtime-cli-context';

const target = Options.choice('target', SETUP_TARGETS).pipe(
  Options.withDefault('auto'),
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

const formatTargets = (targets: ReadonlyArray<AgentHost>): string =>
  targets.map(target => AGENT_HOST_LABELS[target]).join(' and ');

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

const setupCommandError = (message: string, operation: 'setup' | 'uninstall', cause?: unknown) =>
  new SetupCommandError({
    message,
    operation,
    ...(cause === undefined ? {} : { cause }),
  });

const setupBaseCmd = Command.make(
  'setup',
  { target, yes, ifPresent, uninstall },
  ({ target, yes, ifPresent, uninstall }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const terminal = yield* ui.capabilities;
      const { invocationOrigin } = yield* cliInvocationContext;
      const operation = uninstall ? 'uninstall' : 'setup';
      yield* ui.intro(uninstall ? 'composio setup --uninstall' : 'composio setup');

      const detections = yield* detectSetupTargets(target);
      yield* Effect.forEach(detections, detection =>
        trackCliEventEffect(
          getSetupHostDetectedEvent({
            operation,
            requestedTarget: target,
            target: detection.target,
            available: detection.available,
            supported: detection.supported,
            hostVersion: detection.version,
            unsupportedReasonCode:
              detection.available && !detection.supported
                ? (detection.unsupportedReasonCode ?? 'unknown')
                : undefined,
            invocationOrigin,
            cliVersion: APP_VERSION,
          })
        )
      );
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
        return yield* setupCommandError(
          `\`--target all\` requires Claude Code and Codex. Missing: ${formatTargets(notDetected)}. Install the missing agent host, or use \`--target auto\` to operate on detected hosts only.`,
          operation
        );
      }
      if (unsupported.length > 0) {
        const reason = unsupported
          .map(result => result.unsupportedReason)
          .filter((message): message is string => Boolean(message))
          .join(' ');
        if (target !== 'auto') {
          return yield* setupCommandError(reason, operation);
        }
        yield* ui.log.warn(
          `${formatTargets(unsupported.map(result => result.target))} plugin setup skipped. ${reason}`
        );
        if (supported.length === 0) {
          if (ifPresent) {
            yield* trackCliEventEffect(
              getSetupSkippedEvent({
                operation,
                requestedTarget: target,
                invocationOrigin,
                cliVersion: APP_VERSION,
              })
            );
            yield* ui.outro(
              `No supported agent host detected; plugin ${uninstall ? 'uninstall' : 'setup'} skipped.`
            );
            return;
          }
          return yield* setupCommandError(reason, operation);
        }
      }
      if (detected.length === 0) {
        if (target === 'claude' || target === 'codex') {
          return yield* setupCommandError(
            `${target} is not installed or not available on PATH. Install it and rerun \`composio setup${uninstall ? ' --uninstall' : ''} --target ${target}\`.`,
            operation
          );
        }
        if (!ifPresent || target !== 'auto') {
          return yield* setupCommandError(
            `No supported agent host was detected. Install Claude Code or Codex, then rerun \`composio setup${uninstall ? ' --uninstall' : ''}\`.`,
            operation
          );
        }
        yield* trackCliEventEffect(
          getSetupSkippedEvent({
            operation,
            requestedTarget: target,
            invocationOrigin,
            cliVersion: APP_VERSION,
          })
        );
        yield* ui.outro(
          `No supported agent host detected; plugin ${uninstall ? 'uninstall' : 'setup'} skipped.`
        );
        return;
      }

      const inspected = yield* inspectSetupTargets(detections, {
        allowMarketplaceConflict: uninstall,
        operation: uninstall ? 'uninstall' : 'setup',
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
            `The Composio plugin for ${AGENT_HOST_LABELS[status.target]} is installed.`
          );
        }
        for (const status of notInstalled) {
          yield* ui.log.info(
            `The Composio plugin for ${AGENT_HOST_LABELS[status.target]} is not installed.`
          );
        }

        if (!yes && removable.length > 0) {
          if (!terminal.canPrompt) {
            return yield* setupCommandError(
              'Non-interactive uninstall requires `--yes` to approve local changes.',
              operation
            );
          }
          const confirmed = yield* ui.confirm(
            `Remove Composio from ${formatTargets(removable.map(status => status.target))}?`,
            { defaultValue: false }
          );
          if (!confirmed) {
            yield* trackCliEventEffect(
              getSetupCancelledEvent({
                operation,
                requestedTarget: target,
                invocationOrigin,
                cliVersion: APP_VERSION,
              })
            );
            yield* ui.outro('Uninstall cancelled.');
            return;
          }
        }

        const results = yield* uninstallSetupTargets(inspected);
        for (const result of results) {
          if (!result.plugin_changed) continue;
          yield* ui.log.success(
            `Successfully uninstalled the Composio plugin for ${AGENT_HOST_LABELS[result.target]}.`
          );
        }
        yield* ui.outro('Composio plugin uninstall complete.');
        return;
      }

      for (const status of inspected.filter(isSetupPluginReady)) {
        yield* ui.log.success(
          `The Composio plugin for ${AGENT_HOST_LABELS[status.target]} is already installed and enabled.`
        );
      }

      const pending = inspected.filter(status => !isSetupReady(status));
      if (pending.length === 0) {
        yield* ui.outro('Composio setup complete.');
        return;
      }

      const pendingPlugins = pending.filter(status => !isSetupPluginReady(status));
      if (!yes) {
        if (!terminal.canPrompt) {
          return yield* setupCommandError(
            'Non-interactive setup requires `--yes` to approve local changes.',
            operation
          );
        }

        const prompt =
          pendingPlugins.length === pending.length
            ? `Install the Composio plugin for ${formatTargets(pendingPlugins.map(status => status.target))}?`
            : `Finish Composio setup for ${formatTargets(pending.map(status => status.target))}?`;
        const confirmed = yield* ui.confirm(prompt, { defaultValue: true });
        if (!confirmed) {
          yield* trackCliEventEffect(
            getSetupCancelledEvent({
              operation,
              requestedTarget: target,
              invocationOrigin,
              cliVersion: APP_VERSION,
            })
          );
          yield* ui.outro('Setup cancelled.');
          return;
        }
      }

      const results = yield* installSetupTargets(pending);
      for (const result of results) {
        if (!result.plugin_changed) continue;

        const initial = pending.find(status => status.target === result.target);
        if (!initial) {
          return yield* Effect.dieMessage(
            `Setup invariant violated: missing initial state for ${result.target}`
          );
        }
        let action = 'configured and enabled';
        if (!initial.plugin_installed) action = 'installed and enabled';
        else if (!initial.plugin_enabled) action = 'enabled';
        yield* ui.log.success(
          `Successfully ${action} the Composio plugin for ${AGENT_HOST_LABELS[result.target]}.`
        );
      }

      yield* ui.outro('Composio setup complete.');
    }).pipe(
      Effect.mapError(error =>
        error instanceof SetupCommandError
          ? error
          : setupCommandError(errorMessage(error), uninstall ? 'uninstall' : 'setup', error)
      )
    )
);

export const setupCmd = setupBaseCmd.pipe(
  Command.withDescription('Install or uninstall Composio plugins for supported agent hosts.')
);
