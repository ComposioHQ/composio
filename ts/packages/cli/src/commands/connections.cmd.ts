import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import {
  formatConnectedAccountsTable,
  formatConnectedAccountsJson,
} from './connected-accounts/format';

const toolkits = Options.text('toolkits').pipe(
  Options.withDescription(
    'Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'
  ),
  Options.optional
);

const status = Options.choice('status', [
  'INITIALIZING',
  'INITIATED',
  'ACTIVE',
  'FAILED',
  'EXPIRED',
  'INACTIVE',
] as const).pipe(
  Options.withDefault('ACTIVE' as const),
  Options.withDescription('Filter by connection status (default: ACTIVE)')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(100),
  Options.withDescription('Number of results (1-1000)')
);

/**
 * List connected accounts in the consumer ("for you") namespace.
 *
 * Unlike `composio dev connected-accounts list` (which is developer-project-scoped),
 * this command shows the current user's personal connections — the accounts linked
 * via `composio link`.
 *
 * @example
 * ```bash
 * composio connections
 * composio connections --toolkits "gmail,slack"
 * composio connections --status ACTIVE
 * ```
 */
export const connectionsCmd = Command.make(
  'connections',
  { toolkits, status, limit },
  ({ toolkits, status, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const clientSingleton = yield* ComposioClientSingleton;

      const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
        Effect.mapError(formatResolveCommandProjectError)
      );

      if (resolvedProject.projectType !== 'CONSUMER' || !resolvedProject.consumerUserId) {
        yield* ui.log.error(
          'Could not resolve consumer project. Run `composio login` first.'
        );
        return;
      }

      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });

      const toolkitSlugs = Option.isSome(toolkits)
        ? toolkits.value.split(',').map(s => s.trim())
        : undefined;

      const result = yield* ui.withSpinner(
        'Fetching connections...',
        Effect.tryPromise(() =>
          client.connectedAccounts.list({
            toolkit_slugs: toolkitSlugs,
            user_ids: [resolvedProject.consumerUserId!],
            statuses: [status],
            limit: clampLimit(limit),
          })
        )
      );

      if (result.items.length === 0) {
        let hint: string;
        if (Option.isSome(toolkits)) {
          hint = `No connections found for "${toolkits.value}". Connect an app with:\n> composio link ${toolkits.value.split(',')[0]?.trim()}`;
        } else {
          hint = 'No connections found. Connect your first app with:\n> composio link github';
        }
        yield* ui.log.warn(hint);
        yield* ui.output(JSON.stringify({ items: [], total: 0 }, null, 2));
        return;
      }

      const showing = result.items.length;
      const total = result.total_items;

      yield* ui.log.info(
        `${showing} of ${total} connections\n\n${formatConnectedAccountsTable(result.items)}`
      );

      yield* ui.output(formatConnectedAccountsJson(result.items));
    })
).pipe(
  Command.withDescription(
    [
      'List your connected accounts (apps linked via `composio link`).',
      '',
      'Shows all personal ("for you") connections. Unlike `composio dev connected-accounts list`,',
      'this command operates in the consumer namespace — no project setup required.',
      '',
      'Examples:',
      '  composio connections                          List all active connections',
      '  composio connections --toolkits gmail,slack    Filter by toolkit',
      '  composio connections --status EXPIRED          Show expired connections',
      '',
      'See also:',
      '  composio link <toolkit>     Connect a new app',
      '  composio search "<query>"   Find tools to use with your connections',
    ].join('\n')
  )
);
