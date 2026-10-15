import { commandInputError } from 'src/commands/errors';
import { Argument, Command, Flag } from 'effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { TerminalUI } from 'src/services/terminal-ui';

const id = Argument.String('id').pipe(
  Argument.withDescription('Trigger instance ID'),
  Argument.optional
);

const notAllowed = commandInputError('dev triggers disable');

const dangerouslyAllow = Flag.Boolean('dangerously-allow').pipe(
  Flag.withDescription('Acknowledge disabling this trigger instance'),
  Flag.withDefault(false)
);

/**
 * Disable an existing trigger instance.
 */
export const triggersCmd$Disable = Command.make(
  'disable',
  { id, dangerouslyAllow },
  ({ id, dangerouslyAllow }) =>
    Effect.gen(function* () {
      const config = yield* ComposioCliUserConfig;
      if (!config.areDeveloperDangerousCommandsEnabled()) {
        return yield* notAllowed(
          'This developer command is disabled by config. Set developer.destructive_actions to true in ~/.composio/config.json to allow it.'
        );
      }
      if (!dangerouslyAllow) {
        return yield* notAllowed(
          'This developer command requires explicit acknowledgement. Re-run with --dangerously-allow.',
          '--dangerously-allow'
        );
      }
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      if (Option.isNone(id)) {
        yield* ui.log.warn('Missing required argument: <id>');
        yield* ui.log.step(
          'Try specifying a trigger ID, e.g.:\n> composio dev triggers disable "trg_123"\n\nTo find trigger IDs:\n> composio dev triggers status'
        );
        return;
      }

      const idValue = id.value;
      const disabled = yield* ui
        .withSpinner(`Disabling trigger "${idValue}"...`, repo.disableTrigger(idValue))
        .pipe(
          Effect.as(true),
          Effect.catchTag(
            CLIENT_API_ERROR_TAGS,
            handleClientApiError(ui, {
              fallbackMessage: `Failed to disable trigger "${idValue}".`,
              hint: 'Browse available triggers:\n> composio dev triggers status',
              fallbackValue: false,
            })
          )
        );

      if (!disabled) return;

      yield* ui.log.success(`Trigger "${idValue}" disabled.`);
    })
).pipe(Command.withDescription('Disable a trigger instance.'));
