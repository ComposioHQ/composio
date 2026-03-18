import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Trigger instance ID'),
  Args.optional
);

/**
 * Enable an existing trigger instance.
 */
export const triggersCmd$Enable = Command.make('enable', { id }, ({ id }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a trigger ID, e.g.:\n> composio manage triggers enable "trg_123"\n\nTo find trigger IDs:\n> composio manage triggers status --show-disabled'
      );
      return;
    }

    const idValue = id.value;
    const enabled = yield* ui
      .withSpinner(`Enabling trigger "${idValue}"...`, repo.enableTrigger(idValue))
      .pipe(
        Effect.as(true),
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to enable trigger "${idValue}".`,
            hint: 'Browse available triggers:\n> composio manage triggers status --show-disabled',
            fallbackValue: false,
          })
        )
      );

    if (!enabled) return;

    yield* ui.log.success(`Trigger "${idValue}" enabled.`);
  })
).pipe(Command.withDescription('Enable a trigger instance.'));
