import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { redact } from 'src/ui/redact';
import { formatAuthConfigInfo } from '../format';

const id = Args.text({ name: 'id' }).pipe(
  Args.withDescription('Auth config ID (nanoid)'),
  Args.optional
);

/**
 * View details of a specific auth config.
 *
 * @example
 * ```bash
 * composio manage auth-configs info "ac_1232323"
 * ```
 */
export const authConfigsCmd$Info = Command.make('info', { id }, ({ id }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying an auth config ID, e.g.:\n> composio manage auth-configs info "ac_1232323"\n\nTo find auth config IDs:\n> composio manage auth-configs list'
      );
      return;
    }

    const idValue = id.value;

    // Auth config IDs are opaque nanoids — "Did you mean?" suggestions would not be useful
    const itemOpt = yield* ui
      .withSpinner(`Fetching auth config "${idValue}"...`, repo.getAuthConfig(idValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Failed to fetch auth config "${idValue}".`,
            hint: 'Browse available auth configs:\n> composio manage auth-configs list',
            fallbackValue: Option.none(),
          })
        )
      );

    if (Option.isNone(itemOpt)) {
      return;
    }

    const item = itemOpt.value;

    yield* ui.note(formatAuthConfigInfo(item), `Auth Config: ${item.name}`);

    const redactedId = redact({ value: item.id, prefix: 'ac_' });

    // Next step hint
    yield* ui.log.step(
      `To delete this auth config:\n> composio manage auth-configs delete "${redactedId}"`
    );

    yield* ui.output(JSON.stringify(item, null, 2));
  })
).pipe(Command.withDescription('View details of a specific auth config.'));
