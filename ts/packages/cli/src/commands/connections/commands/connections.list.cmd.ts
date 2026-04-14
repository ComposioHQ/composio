import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

const toolkit = Options.text('toolkit').pipe(
  Options.withDescription('Filter by toolkit slug (e.g. "gmail")'),
  Options.optional
);

const formatConnectionsJson = (items: ReadonlyArray<ConnectedAccountItem>): string => {
  const toolkitCounts = items.reduce<Map<string, number>>((acc, item) => {
    acc.set(item.toolkit.slug, (acc.get(item.toolkit.slug) ?? 0) + 1);
    return acc;
  }, new Map());

  const grouped = items.reduce<Record<string, Array<{ status: string; alias?: string | null }>>>(
    (acc, item) => {
      const toolkit = item.toolkit.slug;
      const entry = {
        status: item.status,
        ...(toolkitCounts.get(toolkit)! > 1 ? { alias: item.alias ?? null } : {}),
      };

      if (!acc[toolkit]) {
        acc[toolkit] = [];
      }
      acc[toolkit].push(entry);
      return acc;
    },
    {}
  );

  return JSON.stringify(grouped, null, 2);
};

export const connectionsCmd$List = Command.make('list', { toolkit }, ({ toolkit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;
    const toolkitSlug = Option.getOrUndefined(toolkit);

    const result = yield* ui.withSpinner(
      'Fetching connections...',
      repo.listConnectedAccounts({
        toolkit_slugs: toolkitSlug ? [toolkitSlug] : undefined,
        limit: 1000,
      })
    );

    yield* ui.output(formatConnectionsJson(result.items));
  })
).pipe(
  Command.withDescription(
    'List connection statuses as JSON. Includes aliases when a toolkit has multiple connections.'
  )
);
