import { Effect } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { CommandSurface } from 'src/commands/surface';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatTriggerTypesJson, formatTriggerTypesTable } from '../format';

export type TriggersListParams = {
  readonly toolkit: string;
  readonly limit: number;
};

const invalidToolkit = commandInputError('triggers list');

/**
 * The commands the hints name, on the tree the command runs in. Toolkits are listed only under
 * `dev`, so both trees point there, as `tools list` does.
 */
const triggersListHints = Effect.map(CommandSurface, ({ tree }) => ({
  noResultsCommand: 'composio dev toolkits list',
  infoCommand: tree === 'dev' ? 'composio dev triggers info' : 'composio triggers info',
}));

/**
 * List available trigger types with optional toolkit filters.
 *
 * @example
 * ```bash
 * composio dev triggers list gmail
 * composio dev triggers list slack --limit 10
 * ```
 */
export const runTriggersList = ({ toolkit, limit }: TriggersListParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { noResultsCommand, infoCommand } = yield* triggersListHints;
    const repo = yield* ComposioToolkitsRepository;
    const clampedLimit = clampLimit(limit);

    yield* repo.validateToolkits([toolkit]).pipe(
      Effect.catchTag('services/InvalidToolkitsError', error =>
        Effect.gen(function* () {
          const availableExample = error.availableToolkits.slice(0, 8).join(', ');
          yield* ui.log.step(`List valid toolkits with:\n> ${noResultsCommand}`);
          return yield* Effect.fail(
            invalidToolkit(
              `Toolkit "${toolkit}" is not available. ${availableExample ? `Examples: ${availableExample}` : ''}`,
              '<toolkit>'
            )
          );
        })
      )
    );

    const allTriggerTypes = yield* ui.withSpinner(
      'Fetching trigger types...',
      repo.getTriggerTypes([toolkit])
    );
    const triggerTypes = allTriggerTypes.slice(0, clampedLimit);

    if (triggerTypes.length === 0) {
      yield* ui.log.warn(
        `No trigger types found in toolkit "${toolkit}". Verify the toolkit slug with:\n> ${noResultsCommand}`
      );
      return;
    }

    const count = triggerTypes.length;
    yield* ui.note(
      formatTriggerTypesTable(triggerTypes),
      `Listing ${count} trigger type${count === 1 ? '' : 's'}`
    );

    const firstSlug = triggerTypes[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(`To view details of a trigger type:\n> ${infoCommand} "${firstSlug}"`);
    }

    yield* ui.output(formatTriggerTypesJson(triggerTypes));
  });
