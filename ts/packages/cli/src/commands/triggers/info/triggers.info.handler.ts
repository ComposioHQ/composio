import { Effect, Option } from 'effect';
import { CommandSurface } from 'src/commands/surface';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { formatTriggerTypeInfo } from '../format';

export type TriggersInfoParams = {
  readonly slug: Option.Option<string>;
};

/** The commands the hints name, on the tree the command runs in. */
const triggersInfoHints = Effect.map(CommandSurface, ({ tree }) =>
  tree === 'dev'
    ? {
        exampleCommand: 'composio dev triggers info',
        listCommand: 'composio dev triggers list',
        listCommandPlaceholder: 'composio dev triggers list "<toolkit>"',
      }
    : {
        exampleCommand: 'composio triggers info',
        listCommand: 'composio triggers list',
        listCommandPlaceholder: 'composio triggers list "<toolkit>"',
      }
);

/**
 * View details of a specific trigger type including config and payload schemas.
 *
 * @example
 * ```bash
 * composio dev triggers info "GMAIL_NEW_GMAIL_MESSAGE"
 * ```
 */
export const runTriggersInfo = ({ slug }: TriggersInfoParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { exampleCommand, listCommand, listCommandPlaceholder } = yield* triggersInfoHints;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step(
        `Try specifying a trigger slug, e.g.:\n> ${exampleCommand} "GMAIL_NEW_GMAIL_MESSAGE"`
      );
      return;
    }

    const slugValue = slug.value;

    const triggerTypeOpt = yield* ui
      .withSpinner('Fetching trigger type details...', repo.getTriggerTypeDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Trigger "${slugValue}" not found.`,
            hint: `Browse available trigger types:\n> ${listCommandPlaceholder}`,
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
        `To list more trigger types in this toolkit:\n> ${listCommand} "${toolkitSlug}"`
      );
    }

    yield* ui.output(JSON.stringify(triggerType, null, 2));
  });
