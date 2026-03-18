import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { formatTriggerTypeInfo } from '../format';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")'),
  Args.optional
);

/**
 * View details of a specific trigger type including config and payload schemas.
 *
 * @example
 * ```bash
 * composio manage triggers info "GMAIL_NEW_GMAIL_MESSAGE"
 * ```
 */
export const triggersCmd$Info = Command.make('info', { slug }, ({ slug }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step(
        'Try specifying a trigger slug, e.g.:\n> composio manage triggers info "GMAIL_NEW_GMAIL_MESSAGE"'
      );
      return;
    }

    const slugValue = slug.value;

    const triggerTypeOpt = yield* ui
      .withSpinner('Fetching trigger type details...', repo.getTriggerTypeDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Trigger "${slugValue}" not found.`,
            hint: 'Browse available trigger types:\n> composio manage triggers list',
            fallbackValue: Option.none(),
          })
        )
      );

    if (Option.isNone(triggerTypeOpt)) return;

    const triggerType = triggerTypeOpt.value;

    yield* ui.note(formatTriggerTypeInfo(triggerType), `Trigger: ${triggerType.name}`);

    const toolkitSlug = triggerType.toolkit?.slug?.toLowerCase();
    if (toolkitSlug) {
      yield* ui.log.step(
        `To list more trigger types in this toolkit:\n> composio manage triggers list --toolkits "${toolkitSlug}"`
      );
    }

    yield* ui.output(JSON.stringify(triggerType, null, 2));
  })
).pipe(Command.withDescription('View details of a specific trigger type.'));
