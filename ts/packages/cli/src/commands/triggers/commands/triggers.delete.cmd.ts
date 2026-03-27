import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Trigger instance ID'),
  Args.optional
);

const yes = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDescription('Skip confirmation prompt'),
  Options.withDefault(false)
);

/**
 * Delete a trigger instance.
 */
export const triggersCmd$Delete = Command.make('delete', { id, yes }, ({ id, yes }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a trigger ID, e.g.:\n> composio dev triggers delete "trg_123" --yes\n\nTo find trigger IDs:\n> composio dev triggers status --show-disabled'
      );
      return;
    }

    const idValue = id.value;

    if (!yes) {
      const confirmed = yield* ui.confirm(`Delete trigger "${idValue}"? This cannot be undone.`, {
        defaultValue: false,
      });
      if (!confirmed) {
        yield* ui.log.warn('Deletion cancelled.');
        return;
      }
    }

    const deleted = yield* ui
      .withSpinner(`Deleting trigger "${idValue}"...`, repo.deleteTrigger(idValue))
      .pipe(
        Effect.as(true),
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to delete trigger "${idValue}".`,
            hint: 'Browse available triggers:\n> composio dev triggers status --show-disabled',
            fallbackValue: false,
          })
        )
      );

    if (!deleted) return;

    yield* ui.log.success(`Trigger "${idValue}" deleted.`);
  })
).pipe(Command.withDescription('Delete a trigger instance.'));
