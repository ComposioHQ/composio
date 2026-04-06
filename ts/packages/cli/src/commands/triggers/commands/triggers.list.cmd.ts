import { Args, Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatTriggerTypesJson, formatTriggerTypesTable } from '../format';

type TriggersListCommandConfig = {
  readonly noResultsCommand: string;
  readonly infoCommand: string;
};

const toolkit = Args.text({ name: 'toolkit' }).pipe(
  Args.withDescription('Toolkit slug to list trigger types for (e.g. "gmail")')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(30),
  Options.withDescription('Maximum number of trigger types to show (1-1000)')
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
const makeTriggersListCommand = ({ noResultsCommand, infoCommand }: TriggersListCommandConfig) =>
  Command.make('list', { toolkit, limit }, ({ toolkit, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;
      const clampedLimit = clampLimit(limit);

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
      yield* ui.log.info(
        `Listing ${count} trigger type${count === 1 ? '' : 's'}\n\n${formatTriggerTypesTable(triggerTypes)}`
      );

      const firstSlug = triggerTypes[0]?.slug;
      if (firstSlug) {
        yield* ui.log.step(`To view details of a trigger type:\n> ${infoCommand} "${firstSlug}"`);
      }

      yield* ui.output(formatTriggerTypesJson(triggerTypes));
    })
  ).pipe(Command.withDescription('List available trigger types.'));

export const triggersCmd$List = makeTriggersListCommand({
  noResultsCommand: 'composio dev toolkits list',
  infoCommand: 'composio dev triggers info',
});

export const rootTriggersCmd$List = makeTriggersListCommand({
  noResultsCommand: 'composio dev toolkits list',
  infoCommand: 'composio triggers info',
});
