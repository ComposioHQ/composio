import { Args, Command, HelpDoc, Options, ValidationError } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { TerminalUI } from 'src/services/terminal-ui';

const stateArg = Args.text({ name: 'state' }).pipe(
  Args.withDescription('Set to "on" or "off"'),
  Args.optional
);

const channelOpt = Options.choice('channel', ['stable', 'beta']).pipe(
  Options.withDescription(
    'Release channel for silent self-update. "stable" (default) only follows stable releases; "beta" also follows prerelease builds.'
  ),
  Options.optional
);

export const configAutoUpdateCmd = Command.make(
  'auto-update',
  { state: stateArg, channel: channelOpt },
  ({ state, channel }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const cliConfig = yield* ComposioCliUserConfig;

      if (Option.isNone(state) && Option.isNone(channel)) {
        const { autoUpdateEnabled, autoUpdateChannel } = cliConfig.data;
        yield* ui.log.info(
          `auto-update: ${autoUpdateEnabled ? 'on' : 'off'} (channel: ${autoUpdateChannel})`
        );
        yield* ui.output(
          JSON.stringify({ enabled: autoUpdateEnabled, channel: autoUpdateChannel })
        );
        return;
      }

      let enabled = cliConfig.data.autoUpdateEnabled;
      if (Option.isSome(state)) {
        const stateValue = state.value.toLowerCase();
        if (stateValue !== 'on' && stateValue !== 'off') {
          yield* ui.log.error(`Invalid state "${state.value}". Use "on" or "off".`);
          return yield* Effect.fail(
            ValidationError.invalidValue(HelpDoc.p(`Invalid state: ${state.value}`))
          );
        }
        enabled = stateValue === 'on';
      }

      const nextChannel = Option.getOrElse(channel, () => cliConfig.data.autoUpdateChannel);
      yield* cliConfig.update({
        autoUpdate: { enabled, channel: nextChannel },
      });

      yield* ui.log.success(`auto-update: ${enabled ? 'on' : 'off'} (channel: ${nextChannel})`);
      yield* ui.output(JSON.stringify({ enabled, channel: nextChannel }));
    })
).pipe(
  Command.withDescription(
    [
      'View or configure silent self-update.',
      '',
      'When on (the default), the CLI stages newer releases in the background and applies',
      'them at the start of a later invocation. When off, the CLI only prints the',
      '"Update available" notice. The COMPOSIO_NO_AUTOUPDATE environment variable',
      'disables self-update regardless of this setting.',
      '',
      'Usage:',
      '  composio config auto-update                   Show current state',
      '  composio config auto-update on|off            Enable or disable',
      '  composio config auto-update --channel beta    Also follow beta releases',
    ].join('\n')
  )
);
