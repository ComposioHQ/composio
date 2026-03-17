import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatTriggerTypesJson, formatTriggerTypesTable } from '../format';
import { parseCsv } from '../parse-csv';

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription(
    'Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'
  ),
  Options.optional
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
 * composio manage triggers list
 * composio manage triggers list --toolkits "gmail"
 * composio manage triggers list --toolkits "gmail,slack"
 * ```
 */
export const triggersCmd$List = Command.make('list', { toolkits, limit }, ({ toolkits, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;
    const toolkitFilters = Option.isSome(toolkits) ? parseCsv(toolkits.value) : undefined;
    const clampedLimit = clampLimit(limit);

    const allTriggerTypes = yield* ui.withSpinner(
      'Fetching trigger types...',
      repo.getTriggerTypes(toolkitFilters)
    );
    const triggerTypes = allTriggerTypes.slice(0, clampedLimit);

    if (triggerTypes.length === 0) {
      const hint = Option.isSome(toolkits)
        ? `No trigger types found in toolkit "${toolkits.value}". Verify the toolkit slug with:\n> composio manage toolkits list`
        : 'No trigger types found.';
      yield* ui.log.warn(hint);
      return;
    }

    const count = triggerTypes.length;
    yield* ui.log.info(
      `Listing ${count} trigger type${count === 1 ? '' : 's'}\n\n${formatTriggerTypesTable(triggerTypes)}`
    );

    const firstSlug = triggerTypes[0]?.slug;
    if (firstSlug) {
      yield* ui.log.step(
        `To view details of a trigger type:\n> composio manage triggers info "${firstSlug}"`
      );
    }

    yield* ui.output(formatTriggerTypesJson(triggerTypes));
  })
).pipe(Command.withDescription('List available trigger types.'));
