import { Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import {
  CONNECTED_ACCOUNTS_SHAPE_MESSAGE,
  decodeConnectedAccountList,
} from 'src/effects/decode-connected-account-list';
import { failedWith, requestError } from 'src/effects/request-error';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { actingUser } from 'src/commands/surface';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  getConnectedAccountPermissionGroup,
  getConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';
import { idempotent } from 'src/services/composio-request';

class ConnectionsListRequestError extends requestError('commands/ConnectionsListRequestError') {}

const toolkit = Flag.String('toolkit').pipe(
  Flag.withDescription('Filter by toolkit slug (e.g. "gmail")'),
  Flag.optional
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
    Record<
      string,
      Array<{
        id: string;
        status: string;
        alias?: string | null;
        word_id?: string | null;
        display_name?: string;
        permission_group: string | null;
      }>
    >
  >((acc, item) => {
    const toolkit = item.toolkit.slug;
    // Several accounts for one toolkit keep `alias` on every entry (null when
    // unset); a lone account prints it only when it actually has one.
    const includeAlias = item.alias != null || (toolkitCounts.get(toolkit) ?? 0) > 1;
    const entry = {
      id: item.id,
      status: item.status,
      ...(includeAlias ? { alias: item.alias ?? null } : {}),
      ...(item.word_id != null ? { word_id: item.word_id } : {}),
      ...(item.display_name !== undefined ? { display_name: item.display_name } : {}),
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
    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const toolkitSlug = Option.getOrUndefined(toolkit);
    const { userId: consumerUserId, project: resolvedProject } = yield* actingUser();

    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const rawResult = yield* client.connectedAccounts
      .list(
        {
          toolkit_slugs: toolkitSlug ? [toolkitSlug] : undefined,
          user_ids: [consumerUserId],
          limit: 1000,
        },
        idempotent
      )
      .pipe(failedWith(ConnectionsListRequestError, 'Failed to list connections.'));
    const result = yield* decodeConnectedAccountList(rawResult).pipe(
      failedWith(ConnectionsListRequestError, CONNECTED_ACCOUNTS_SHAPE_MESSAGE)
    );
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
    'List connections as JSON with each account id and status, plus its alias, word_id, and provider display name when available.'
  ),
  Command.withExamples([
    {
      command: 'composio connections list',
    },
    {
      command: 'composio connections list --toolkit gmail',
    },
  ])
);
