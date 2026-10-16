import { Argument, Command } from 'effect/cli';
import { Effect, Option } from 'effect';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

const id = Argument.String('id').pipe(
  Argument.withDescription('Trigger instance ID'),
  Argument.optional
);

/**
 * Enable an existing trigger instance.
 */
export const triggersCmd$Enable = Command.make('enable', { id }, ({ id }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a trigger ID, e.g.:\n> composio dev triggers enable "trg_123"\n\nTo find trigger IDs:\n> composio dev triggers status --show-disabled'
      );
      return;
    }

    const idValue = id.value;
    const enabled = yield* ui
      .withSpinner(`Enabling trigger "${idValue}"...`, repo.enableTrigger(idValue))
      .pipe(
        Effect.as(true),
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Failed to enable trigger "${idValue}".`,
            hint: 'Browse available triggers:\n> composio dev triggers status --show-disabled',
            fallbackValue: false,
          })
        )
      );

    if (!enabled) return;

    yield* ui.log.success(`Trigger "${idValue}" enabled.`);
  })
).pipe(Command.withDescription('Enable a trigger instance.'));
