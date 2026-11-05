import type { ComposioClientShape } from '@composio/client/effect';
import { Data, Effect, Option, Schema } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';
import type { TerminalUI } from 'src/services/terminal-ui';
import { memoizeInProcess } from 'src/utils/memoize-in-process';
import { clientScopeKey } from 'src/services/composio-clients';
import { listAllConnectedAccounts } from 'src/services/list-all-connected-accounts';

// `status` is an open enum, so this is shape-identical to
// `ConnectedAccountItem`; tool-router rows normalize statuses outside the
// known set to an `'UNKNOWN'` sentinel. Selection only picks `'ACTIVE'`, so
// unknown rows still drop out — but without falsely labeling them
// `'INACTIVE'` (= user-disabled).
export type SelectableConnectedAccount = ConnectedAccountItem;

export const CachedConnectedAccountSummarySchema = Schema.Struct({
  id: Schema.String,
  alias: Schema.NullOr(Schema.String),
  wordId: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  createdAt: Schema.String,
});
export type CachedConnectedAccountSummary = typeof CachedConnectedAccountSummarySchema.Type;

const normalizeSelector = (value: string): string => value.trim().toLowerCase();

const parseTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const compareNewestFirst = (
  left: { readonly updated_at?: string | null; readonly created_at?: string | null },
  right: { readonly updated_at?: string | null; readonly created_at?: string | null }
): number =>
  Math.max(parseTimestamp(right.updated_at), parseTimestamp(right.created_at)) -
  Math.max(parseTimestamp(left.updated_at), parseTimestamp(left.created_at));

const compareSummaryNewestFirst = (
  left: Pick<CachedConnectedAccountSummary, 'updatedAt' | 'createdAt'>,
  right: Pick<CachedConnectedAccountSummary, 'updatedAt' | 'createdAt'>
): number =>
  Math.max(parseTimestamp(right.updatedAt), parseTimestamp(right.createdAt)) -
  Math.max(parseTimestamp(left.updatedAt), parseTimestamp(left.createdAt));

export const isUsableConnectedAccount = (
  item: Pick<SelectableConnectedAccount, 'status' | 'is_disabled'>
): boolean => item.status === 'ACTIVE' && !item.is_disabled;

export const toCachedConnectedAccountSummary = (
  item: Pick<ConnectedAccountItem, 'id' | 'alias' | 'word_id' | 'updated_at' | 'created_at'>
): CachedConnectedAccountSummary => ({
  id: item.id,
  alias: item.alias ?? null,
  wordId: item.word_id ?? null,
  updatedAt: item.updated_at,
  createdAt: item.created_at,
});

export const groupCachedConnectedAccountsByToolkit = (
  items: ReadonlyArray<SelectableConnectedAccount>
): Record<string, ReadonlyArray<CachedConnectedAccountSummary>> => {
  const grouped = new Map<string, CachedConnectedAccountSummary[]>();

  for (const item of items) {
    if (!isUsableConnectedAccount(item)) continue;
    const toolkit = item.toolkit.slug.trim().toLowerCase();
    if (!toolkit) continue;

    const next = grouped.get(toolkit) ?? [];
    next.push(toCachedConnectedAccountSummary(item));
    grouped.set(toolkit, next);
  }

  return Object.fromEntries(
    [...grouped.entries()].map(([toolkit, summaries]) => [
      toolkit,
      [...summaries].sort(compareSummaryNewestFirst),
    ])
  );
};

export const resolveDefaultConnectedAccountsByToolkit = (
  items: ReadonlyArray<SelectableConnectedAccount>
): Record<string, string> => {
  const grouped = new Map<string, SelectableConnectedAccount[]>();

  for (const item of items) {
    if (!isUsableConnectedAccount(item)) continue;
    const toolkit = item.toolkit.slug.trim().toLowerCase();
    if (!toolkit) continue;

    const next = grouped.get(toolkit) ?? [];
    next.push(item);
    grouped.set(toolkit, next);
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .map(([toolkit, toolkitItems]) => {
        const selected = resolveConnectedAccountSelection(toolkitItems);
        return selected ? ([toolkit, selected.id] as const) : null;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null)
  );
};

export const resolveConnectedAccountSelection = (
  items: ReadonlyArray<SelectableConnectedAccount>,
  selector?: string
): SelectableConnectedAccount | undefined => {
  const usable = items.filter(isUsableConnectedAccount).sort(compareNewestFirst);
  if (usable.length === 0) return undefined;

  if (!selector || selector.trim().length === 0) {
    return usable.find(item => normalizeSelector(item.alias ?? '') === 'default') ?? usable[0];
  }

  const normalized = normalizeSelector(selector);
  return (
    usable.find(item => normalizeSelector(item.id) === normalized) ??
    usable.find(item => normalizeSelector(item.alias ?? '') === normalized) ??
    usable.find(item => normalizeSelector(item.word_id ?? '') === normalized)
  );
};

export const formatConnectedAccountChoice = (
  item: Pick<ConnectedAccountItem, 'id' | 'alias' | 'word_id'>
): string => {
  const labels = [item.alias, item.word_id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  return labels.length > 0 ? `${labels.join(' / ')} (${item.id})` : item.id;
};

export const formatConnectedAccountChoices = (
  items: ReadonlyArray<ConnectedAccountItem>
): ReadonlyArray<string> =>
  items.filter(isUsableConnectedAccount).sort(compareNewestFirst).map(formatConnectedAccountChoice);

/**
 * Every active connected account of `userId`, fetched once per credential,
 * org, project, and user for the lifetime of the process. The client's
 * credential, org, and project come from `clientScopeKey`: each `getFor`
 * builds a new client, so two callers holding different instances for the
 * same key and project still share one fetch.
 *
 * `composio execute` needs this list twice on every call, from two code paths
 * that cannot see each other: `resolveConnectedAccountForToolkit` picks the
 * account for the tool's toolkit, then `resolveToolRouterSessionConnections`
 * builds the session's connection context from the full list. The per-toolkit
 * view is a subset of this list, so both read from here instead of issuing
 * their own `GET /connected_accounts`.
 *
 * Every page is fetched (`listAllConnectedAccounts`): the server serves at
 * most 50 accounts per request, and a first page alone dropped connected
 * toolkits from the session for users with more active accounts than that.
 * Fails with the client's error; each caller wraps it in its own error.
 */
export const listActiveConnectedAccounts = memoizeInProcess({
  keyOf: (input: { readonly client: ComposioClientShape; readonly userId: string }) =>
    `${clientScopeKey(input.client)}\u0000${input.userId}`,
  make: ({ client, userId }) =>
    listAllConnectedAccounts(client, { user_ids: [userId], statuses: ['ACTIVE'] }),
});

/**
 * The active accounts of one toolkit, in server order, derived from the
 * shared per-user list so `composio execute` does not issue a second,
 * toolkit-filtered `GET /connected_accounts` next to the one session creation
 * needs anyway. The slug is trimmed and lower-cased the way the grouping
 * helpers above normalize toolkit slugs, so a padded `--toolkit` value still
 * matches.
 */
export const listConnectedAccountsForToolkit = (params: {
  readonly client: ComposioClientShape;
  readonly userId: string;
  readonly toolkitSlug: string;
}) =>
  Effect.gen(function* () {
    const items = yield* listActiveConnectedAccounts({
      client: params.client,
      userId: params.userId,
    });
    const wantedToolkit = normalizeSelector(params.toolkitSlug);
    return items.filter(item => normalizeSelector(item.toolkit.slug) === wantedToolkit);
  });

export class ConnectedAccountResolutionError extends Data.TaggedError(
  'services/ConnectedAccountResolutionError'
)<{
  readonly message: string;
  readonly toolkitSlug: string;
  readonly cause?: unknown;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

export const resolveConnectedAccountForToolkit = (params: {
  readonly client: ComposioClientShape;
  readonly toolkitSlug?: string;
  readonly userId: string;
  readonly selector: Option.Option<string>;
}): Effect.Effect<string | undefined, ConnectedAccountResolutionError, TerminalUI> =>
  Effect.gen(function* () {
    if (!params.toolkitSlug) return undefined;
    const toolkitSlug = params.toolkitSlug;

    const toolkitItems = yield* listConnectedAccountsForToolkit({
      client: params.client,
      userId: params.userId,
      toolkitSlug,
    }).pipe(
      Effect.mapError(
        cause =>
          new ConnectedAccountResolutionError({
            // "Error: " is how this message has always introduced the client's failure.
            message: `Failed to load connected accounts for toolkit "${toolkitSlug}": Error: ${cause.message}`,
            toolkitSlug,
            cause,
          })
      )
    );
    const selectableAccounts = yield* decodeConnectedAccountItems(toolkitItems).pipe(
      Effect.mapError(
        cause =>
          new ConnectedAccountResolutionError({
            message: `Connected accounts for toolkit "${toolkitSlug}" did not match the expected response shape.`,
            toolkitSlug,
            cause,
          })
      )
    );

    // A selector that is empty or all-whitespace (e.g. `--account=`) is
    // treated as "no selector" by resolveConnectedAccountSelection below; the
    // ambiguity guard below it must agree, or an empty --account value would
    // silently reach the "exactly one choice" fallback instead of failing.
    const effectiveSelector = Option.filter(params.selector, value => value.trim().length > 0);

    const selected = resolveConnectedAccountSelection(
      selectableAccounts,
      Option.getOrUndefined(effectiveSelector)
    );

    if (selected) {
      // No --account given: if more than one usable account exists and none
      // is the explicit alias=default, picking one silently is dangerous
      // (e.g. an agent reading/writing the wrong mailbox). Fail the same way
      // an unmatched selector already does, instead of guessing.
      if (Option.isNone(effectiveSelector)) {
        const usable = selectableAccounts.filter(isUsableConnectedAccount);
        const hasExplicitDefault = usable.some(
          item => normalizeSelector(item.alias ?? '') === 'default'
        );
        if (!hasExplicitDefault && usable.length > 1) {
          const choices = formatConnectedAccountChoices(selectableAccounts);
          return yield* new ConnectedAccountResolutionError({
            message: `Multiple connected accounts exist for toolkit "${toolkitSlug}" and no --account was given. Available accounts: ${choices.join(', ')}. Pass --account <alias or id> to choose one.`,
            toolkitSlug,
          });
        }
      }
      return selected.id;
    }
    if (Option.isNone(effectiveSelector)) return undefined;

    const choices = formatConnectedAccountChoices(selectableAccounts);
    const hint =
      choices.length > 0
        ? ` Available accounts: ${choices.join(', ')}.`
        : ' No active connected accounts were found for that toolkit.';
    return yield* new ConnectedAccountResolutionError({
      message: `No connected account matched "${effectiveSelector.value}" for toolkit "${toolkitSlug}".${hint}`,
      toolkitSlug,
    });
  });
