import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { decodeConnectedAccountListWithFallback } from 'src/effects/decode-connected-account-list';
import { requireAuth } from 'src/effects/require-auth';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  getConnectedAccountPermissionGroup,
  getConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';

const toolkit = Options.text('toolkit').pipe(
  Options.withDescription('Filter by toolkit slug (e.g. "gmail")'),
  Options.optional
);

const formatConnectionsJson = (
  items: ReadonlyArray<ConnectedAccountItem>,
  permissionGroups: ReadonlyMap<string, string | undefined> = new Map()
): string => {
  const toolkitCounts = items.reduce<Map<string, number>>((acc, item) => {
    acc.set(item.toolkit.slug, (acc.get(item.toolkit.slug) ?? 0) + 1);
    return acc;
  }, new Map());

  const grouped = items.reduce<
    Record<string, Array<{ status: string; alias?: string | null; word_id?: string | null }>>
  >((acc, item) => {
    const toolkit = item.toolkit.slug;
    const includeAlias = toolkitCounts.get(toolkit)! > 1;
    const entry = {
      status: item.status,
      ...(includeAlias ? { alias: item.alias ?? null } : {}),
      ...(item.word_id != null ? { word_id: item.word_id } : {}),
      permission_group: permissionGroups.get(item.id) ?? null,
    };

    if (!acc[toolkit]) {
      acc[toolkit] = [];
    }
    acc[toolkit].push(entry);
    return acc;
  }, {});

  return JSON.stringify(grouped, null, 2);
};

export const connectionsCmd$List = Command.make('list', { toolkit }, ({ toolkit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const toolkitSlug = Option.getOrUndefined(toolkit);
    const resolvedProject = yield* resolveCommandProject({
      mode: 'consumer',
    }).pipe(Effect.mapError(formatResolveCommandProjectError));

    const consumerUserId = resolvedProject.consumerUserId;
    if (!consumerUserId) {
      return yield* Effect.fail(
        new Error('Missing consumer user id. Run `composio login` and try again.')
      );
    }

    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const rawResult = yield* Effect.tryPromise(() =>
      client.connectedAccounts.list({
        toolkit_slugs: toolkitSlug ? [toolkitSlug] : undefined,
        user_ids: [consumerUserId],
        limit: 1000,
      })
    );
    const result = yield* decodeConnectedAccountListWithFallback(rawResult);
    const permissionSnapshot = yield* getConsumerPermissionSnapshot({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
      consumerUserId,
      connectedAccountIds: result.items.map(item => item.id),
    });
    const permissionGroups = new Map(
      result.items.map(item => [
        item.id,
        getConnectedAccountPermissionGroup({
          snapshot: permissionSnapshot,
          connectedAccountId: item.id,
        }),
      ])
    );

    yield* ui.output(formatConnectionsJson(result.items, permissionGroups), { force: true });
  })
).pipe(
  Command.withDescription(
    'List connection statuses as JSON. Includes aliases for duplicate toolkits and word_ids when available.'
  )
);
