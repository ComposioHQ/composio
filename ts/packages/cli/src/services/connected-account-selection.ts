import type { Composio } from '@composio/client';
import { Data, Effect, Option, Schema } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';
import type { TerminalUI } from 'src/services/terminal-ui';
import { memoizeInProcess } from 'src/utils/memoize-in-process';

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

// `Composio` clients come from `ComposioClientSingleton`, one instance per
// org/project, so identity is a sound cache key. Ids instead of the object
// itself keep the memo key a string.
const clientIds = new WeakMap<Composio, number>();
let nextClientId = 0;
const clientId = (client: Composio): number => {
  let id = clientIds.get(client);
  if (id === undefined) {
    id = nextClientId++;
    clientIds.set(client, id);
  }
  return id;
};

/**
 * Every active connected account of `userId`, fetched once per client and
 * user for the lifetime of the process.
 *
 * `composio execute` needs this list twice on every call, from two code paths
 * that cannot see each other: `resolveConnectedAccountForToolkit` picks the
 * account for the tool's toolkit, then `resolveToolRouterSessionConnections`
 * builds the session's connection context from the full list. The per-toolkit
 * view is a subset of this list, so both read from here instead of issuing
 * their own `GET /connected_accounts`.
 *
 * The page size is the session path's existing one; a user with more active
 * accounts than that was already truncated there. Fails with the raw
 * rejection; each caller wraps it in its own error.
 */
const ACTIVE_ACCOUNTS_PAGE_SIZE = 1000;

export const listActiveConnectedAccounts = memoizeInProcess({
  keyOf: (input: { readonly client: Composio; readonly userId: string }) =>
    `${clientId(input.client)}\u0000${input.userId}`,
  make: ({ client, userId }) =>
    Effect.tryPromise({
      try: () =>
        client.connectedAccounts.list({
          user_ids: [userId],
          statuses: ['ACTIVE'],
          limit: ACTIVE_ACCOUNTS_PAGE_SIZE,
        }),
      catch: cause => cause,
    }),
});

const TOOLKIT_ACCOUNTS_PAGE_SIZE = 100;

// The account picker's own query: one toolkit, first 100 active accounts, in
// server order. Kept as the fallback so results stay identical when the
// shared list cannot stand in for it.
const fetchConnectedAccountsForToolkit = (params: {
  readonly client: Composio;
  readonly userId: string;
  readonly toolkitSlug: string;
}) =>
  Effect.tryPromise({
    try: () =>
      params.client.connectedAccounts.list({
        toolkit_slugs: [params.toolkitSlug],
        user_ids: [params.userId],
        statuses: ['ACTIVE'],
        limit: TOOLKIT_ACCOUNTS_PAGE_SIZE,
      }),
    // The raw rejection, so the caller's message reads as it always has.
    catch: cause => cause,
  }).pipe(Effect.map(response => response.items));

/**
 * The active accounts of one toolkit, derived from the shared per-user list
 * when that list is complete, so `composio execute` does not issue a second,
 * toolkit-filtered `GET /connected_accounts` next to the one session creation
 * needs anyway.
 *
 * Derivation reproduces the server query: same slug match, server order
 * preserved, first 100. If the shared list may be truncated (more active
 * accounts than its page holds), the toolkit's accounts may sit past the cut,
 * so the original filtered request runs instead. A page is taken as complete
 * when it is shorter than the requested size and carries no cursor.
 * `total_items` is deliberately not consulted: whether it honors the status
 * filter is a server detail, and a count that did not would make the derived
 * path look truncated on every call and silently fall back forever.
 *
 * The slug is trimmed and lower-cased the way the grouping helpers above
 * normalize toolkit slugs, and the trimmed slug is what the fallback sends,
 * so a padded `--toolkit` value resolves the same way on both paths.
 */
export const listConnectedAccountsForToolkit = (params: {
  readonly client: Composio;
  readonly userId: string;
  readonly toolkitSlug: string;
}) =>
  Effect.gen(function* () {
    const toolkitSlug = params.toolkitSlug.trim();
    const shared = yield* listActiveConnectedAccounts({
      client: params.client,
      userId: params.userId,
    });
    const items = shared.items;
    const complete = shared.next_cursor == null && items.length < ACTIVE_ACCOUNTS_PAGE_SIZE;
    if (!complete) {
      return yield* fetchConnectedAccountsForToolkit({ ...params, toolkitSlug });
    }

    const wantedToolkit = normalizeSelector(toolkitSlug);
    return items
      .filter(item => normalizeSelector(item.toolkit.slug) === wantedToolkit)
      .slice(0, TOOLKIT_ACCOUNTS_PAGE_SIZE);
  });

export class ConnectedAccountResolutionError extends Data.TaggedError(
  'services/ConnectedAccountResolutionError'
)<{
  readonly message: string;
  readonly toolkitSlug: string;
  readonly cause?: unknown;
}> {}

export const resolveConnectedAccountForToolkit = (params: {
  readonly client: Composio;
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
            message: `Failed to load connected accounts for toolkit "${toolkitSlug}": ${String(cause)}`,
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

    const selected = resolveConnectedAccountSelection(
      selectableAccounts,
      Option.getOrUndefined(params.selector)
    );
    if (selected) return selected.id;
    if (Option.isNone(params.selector)) return undefined;

    const choices = formatConnectedAccountChoices(selectableAccounts);
    const hint =
      choices.length > 0
        ? ` Available accounts: ${choices.join(', ')}.`
        : ' No active connected accounts were found for that toolkit.';
    return yield* new ConnectedAccountResolutionError({
      message: `No connected account matched "${params.selector.value}" for toolkit "${toolkitSlug}".${hint}`,
      toolkitSlug,
    });
  });
