import { Effect } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { CommandSurface } from 'src/commands/surface';
import { commandHintStep } from 'src/services/command-hints';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatTriggerTypesJson, formatTriggerTypesTable } from '../format';

export type TriggersListParams = {
  readonly toolkit: string;
  readonly limit: number;
};

const invalidToolkit = commandInputError('triggers list');

const findToolkitHint = commandHintStep('Find the toolkit for a task with', 'root.search', {
  query: '<what you want to do>',
});

/**
 * The hints, on the tree the command runs in. Toolkits are listed only under `dev`, so the root
 * tree finds a toolkit through `composio search` instead.
 */
const triggersListHints = Effect.map(CommandSurface, ({ tree }) =>
  tree === 'dev'
    ? {
        invalidToolkitHint: commandHintStep('List valid toolkits with', 'dev.toolkits.list'),
        noResultsHint: commandHintStep('Verify the toolkit slug with', 'dev.toolkits.list'),
        infoCommand: 'composio dev triggers info',
      }
    : {
        invalidToolkitHint: findToolkitHint,
        noResultsHint: findToolkitHint,
        infoCommand: 'composio triggers info',
      }
);

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
    const { invalidToolkitHint, noResultsHint, infoCommand } = yield* triggersListHints;
    const repo = yield* ComposioToolkitsRepository;
    const clampedLimit = clampLimit(limit);

    yield* repo.validateToolkits([toolkit]).pipe(
      Effect.catchTag('services/InvalidToolkitsError', error =>
        Effect.gen(function* () {
          const availableExample = error.availableToolkits.slice(0, 8).join(', ');
          yield* ui.log.step(invalidToolkitHint);
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
      yield* ui.log.warn(`No trigger types found in toolkit "${toolkit}". ${noResultsHint}`);
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
