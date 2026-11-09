import { Array as Arr, Effect, Option } from 'effect';
import { CommandSurface, resolveSurfaceProject } from 'src/commands/surface';
import {
  CONNECTED_ACCOUNTS_SHAPE_MESSAGE,
  decodeConnectedAccountList,
} from 'src/effects/decode-connected-account-list';
import { failedWith } from 'src/effects/request-error';
import type { KnownConnectedAccountStatus } from 'src/models/connected-accounts';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { ConnectedAccountsListRequestError } from './connected-accounts.list.errors';
import {
  FETCHING_CONNECTED_ACCOUNTS_MESSAGE,
  LIST_CONNECTED_ACCOUNTS_FAILED_MESSAGE,
  formatConnectedAccountsJson,
  listingMessage,
  noConnectedAccountsMessage,
  viewDetailsHint,
} from './connected-accounts.list.format';

/**
 * The flags of `composio dev connected-accounts list`. The `dev` group's `--user-id` and
 * `--project-name` come from `CommandSurface`, not from here.
 */
export type ConnectedAccountsListParams = {
  readonly toolkits: Option.Option<string>;
  readonly status: Option.Option<KnownConnectedAccountStatus>;
  readonly limit: number;
};

/** Lists one page of connected accounts in the developer project, filtered by the flags. */
export const runConnectedAccountsList = ({
  toolkits,
  status,
  limit,
}: ConnectedAccountsListParams) =>
  Effect.gen(function* () {
    const { userId } = yield* CommandSurface;
    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;

    const resolvedProject = yield* resolveSurfaceProject('developer');
    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });

    const rawResult = yield* ui.withSpinner(
      FETCHING_CONNECTED_ACCOUNTS_MESSAGE,
      client.connectedAccounts
        .list(
          {
            toolkit_slugs: Option.getOrUndefined(
              Option.map(toolkits, csv => csv.split(',').map(slug => slug.trim()))
            ),
            user_ids: Option.getOrUndefined(Option.map(userId, Arr.of)),
            statuses: Option.getOrUndefined(Option.map(status, Arr.of)),
            limit: clampLimit(limit),
          },
          idempotent
        )
        .pipe(failedWith(ConnectedAccountsListRequestError, LIST_CONNECTED_ACCOUNTS_FAILED_MESSAGE))
    );
    const result = yield* decodeConnectedAccountList(rawResult).pipe(
      failedWith(ConnectedAccountsListRequestError, CONNECTED_ACCOUNTS_SHAPE_MESSAGE)
    );

    yield* Arr.match(result.items, {
      onEmpty: () => ui.log.warn(noConnectedAccountsMessage({ toolkits, userId, status })),
      onNonEmpty: nonEmptyItems =>
        Effect.gen(function* () {
          yield* ui.log.info(listingMessage(nonEmptyItems, result.total_items));
          const firstId = Arr.headNonEmpty(nonEmptyItems).id;
          if (firstId) {
            yield* ui.log.step(viewDetailsHint(firstId));
          }
          yield* ui.output(formatConnectedAccountsJson(nonEmptyItems));
        }),
    });
  });
