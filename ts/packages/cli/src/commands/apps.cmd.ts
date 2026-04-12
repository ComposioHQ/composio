import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { requireAuth } from 'src/effects/require-auth';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { mergeToolkitData, formatToolkitsTable, formatToolkitsJson } from './toolkits/format';

const query = Options.text('query').pipe(
  Options.withDescription('Search by name, slug, or description'),
  Options.optional
);

const connected = Options.boolean('connected').pipe(
  Options.withDescription('Show only connected apps'),
  Options.optional
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(1000),
  Options.withDescription('Number of results (1-1000)')
);

/**
 * List all available Composio apps with connection status.
 *
 * Operates in the consumer ("for you") namespace — no developer project setup
 * required. Fetches the full toolkit catalog and enriches it with the current
 * user's connection status via a Tool Router session.
 *
 * @example
 * ```bash
 * composio apps
 * composio apps --query "email"
 * composio apps --connected
 * ```
 */
export const appsCmd = Command.make(
  'apps',
  { query, connected, limit },
  ({ query, connected, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;
      const clientSingleton = yield* ComposioClientSingleton;

      const clampedLimit = clampLimit(limit);

      // Resolve consumer project for connection status enrichment.
      const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
        Effect.mapError(formatResolveCommandProjectError)
      );

      const consumerUserId =
        resolvedProject.projectType === 'CONSUMER'
          ? resolvedProject.consumerUserId
          : undefined;

      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });

      // Fetch catalog and session data in parallel.
      const catalogEffect = repo.searchToolkits({
        search: Option.getOrUndefined(query),
        limit: clampedLimit,
      });

      const sessionContextEffect = consumerUserId
        ? resolveToolRouterSession(client, consumerUserId, {
            cacheScope: {
              orgId: resolvedProject.orgId,
              consumerUserId,
            },
          }).pipe(
            Effect.catchAll(error =>
              Effect.logDebug('Failed to create session:', error).pipe(Effect.as(undefined))
            )
          )
        : Effect.succeed(undefined as undefined);

      const [catalogResult, sessionContext] = yield* ui.withSpinner(
        'Fetching apps...',
        Effect.all([catalogEffect, sessionContextEffect], { concurrency: 'unbounded' })
      );

      if (catalogResult.items.length === 0) {
        yield* ui.log.warn(
          Option.isSome(query)
            ? `No apps found for "${query.value}". Try a different search.`
            : 'No apps found.'
        );
        yield* ui.output('[]');
        return;
      }

      // Enrich with session data (logos + connection status) when available.
      let sessionItems:
        | ReadonlyArray<
            import('@composio/client/resources/tool-router').SessionToolkitsResponse.Item
          >
        | undefined;
      if (sessionContext) {
        sessionItems = yield* Effect.tryPromise(() =>
          sessionContext.client.toolRouter.session.toolkits(sessionContext.sessionId, {
            search: Option.getOrUndefined(query),
            limit: clampedLimit,
            is_connected: Option.getOrUndefined(connected),
          })
        ).pipe(
          Effect.map(r => r.items),
          Effect.catchAll(error =>
            Effect.logDebug('Failed to fetch session toolkits:', error).pipe(
              Effect.as(undefined)
            )
          )
        );
      }

      let unified = mergeToolkitData(catalogResult.items, sessionItems);

      // Apply --connected filter client-side when session data is available.
      const isConnectedFilter = Option.getOrUndefined(connected);
      if (isConnectedFilter && sessionItems) {
        unified = unified.filter(t => t.connected?.status === 'ACTIVE');
      } else if (isConnectedFilter && !sessionItems) {
        yield* ui.log.warn(
          '`--connected` filter could not be applied — session data unavailable.'
        );
      }

      if (unified.length === 0) {
        yield* ui.log.warn('No connected apps found. Try without --connected.');
        yield* ui.output('[]');
        return;
      }

      const showing = unified.length;
      const total = catalogResult.total_items;

      yield* ui.log.info(
        `${showing} of ${total} apps\n\n${formatToolkitsTable(unified)}`
      );

      yield* ui.output(formatToolkitsJson(unified));
    })
).pipe(
  Command.withDescription(
    [
      'List all available Composio apps with connection status.',
      '',
      'Shows the full toolkit catalog enriched with your personal connection status.',
      'No developer project setup required — operates in the consumer namespace.',
      '',
      'Examples:',
      '  composio apps                    List all available apps',
      '  composio apps --query "email"    Search by name or description',
      '  composio apps --connected        Show only connected apps',
      '',
      'See also:',
      '  composio link <toolkit>          Connect an app',
      '  composio connections             List connected accounts in detail',
    ].join('\n')
  )
);
