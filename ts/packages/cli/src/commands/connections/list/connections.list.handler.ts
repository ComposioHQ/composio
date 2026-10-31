import { Effect, Option } from 'effect';
import {
  CONNECTED_ACCOUNTS_SHAPE_MESSAGE,
  decodeAllConnectedAccountPages,
} from 'src/effects/decode-connected-account-list';
import { failedWith } from 'src/effects/request-error';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { actingUser } from 'src/commands/surface';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  getConnectedAccountPermissionGroup,
  getConsumerPermissionSnapshot,
} from 'src/services/tool-permissions';
import { listAllConnectedAccounts } from 'src/services/list-all-connected-accounts';
import { ConnectionsListRequestError } from './connections.list.errors';
import { formatConnectionsJson } from './connections.list.format';

/** The flags of `composio connections list`. */
export type ConnectionsListParams = {
  readonly toolkit: Option.Option<string>;
};

/**
 * Prints the acting user's connections, optionally for one toolkit, as JSON grouped by toolkit
 * slug with each account's permission group.
 */
export const runConnectionsList = ({ toolkit }: ConnectionsListParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const toolkitSlug = Option.getOrUndefined(toolkit);
    const { userId: consumerUserId, project: resolvedProject } = yield* actingUser();

    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const rawItems = yield* listAllConnectedAccounts(client, {
      toolkit_slugs: toolkitSlug ? [toolkitSlug] : undefined,
      user_ids: [consumerUserId],
    }).pipe(failedWith(ConnectionsListRequestError, 'Failed to list connections.'));
    const items = yield* decodeAllConnectedAccountPages(rawItems).pipe(
      failedWith(ConnectionsListRequestError, CONNECTED_ACCOUNTS_SHAPE_MESSAGE)
    );
    const permissionSnapshot = yield* getConsumerPermissionSnapshot({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
      consumerUserId,
      connectedAccountIds: items.map(item => item.id),
    });
    const permissionGroups = new Map(
      items.map(item => [
        item.id,
        getConnectedAccountPermissionGroup({
          snapshot: permissionSnapshot,
          connectedAccountId: item.id,
        }),
      ])
    );

    yield* ui.output(formatConnectionsJson(items, permissionGroups), { force: true });
  });
