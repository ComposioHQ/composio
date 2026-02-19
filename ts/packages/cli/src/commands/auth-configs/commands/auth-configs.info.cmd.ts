import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository, HttpServerError } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
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
 * composio auth-configs info "ac_1232323"
 * ```
 */
export const authConfigsCmd$Info = Command.make('info', { id }, ({ id }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const repo = yield* ComposioToolkitsRepository;

    // Auth guard
    if (Option.isNone(ctx.data.apiKey)) {
      yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
      return;
    }

    // Missing ID guard
    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying an auth config ID, e.g.:\n> composio auth-configs info "ac_1232323"\n\nTo find auth config IDs:\n> composio auth-configs list'
      );
      return;
    }

    const idValue = id.value;

    const itemOpt = yield* ui
      .withSpinner(`Fetching auth config "${idValue}"...`, repo.getAuthConfig(idValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag('services/HttpServerError', (e: HttpServerError) =>
          Effect.gen(function* () {
            if (e.details) {
              yield* ui.log.error(e.details.message);
              yield* ui.log.step(e.details.suggestedFix);
            } else {
              yield* ui.log.error(`Failed to fetch auth config "${idValue}".`);
            }

            yield* ui.log.step('Browse available auth configs:\n> composio auth-configs list');

            return Option.none();
          })
        )
      );

    if (Option.isNone(itemOpt)) {
      return;
    }

    const item = itemOpt.value;

    yield* ui.note(formatAuthConfigInfo(item), `Auth Config: ${item.name}`);

    // Next step hint
    yield* ui.log.step(`To delete this auth config:\n> composio auth-configs delete "${item.id}"`);

    yield* ui.output(JSON.stringify(item, null, 2));
  })
).pipe(Command.withDescription('View details of a specific auth config.'));
