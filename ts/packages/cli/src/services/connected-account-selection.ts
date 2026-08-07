import type { Composio } from '@composio/client';
import { Data, Effect, Option, Schema } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';
import type { TerminalUI } from 'src/services/terminal-ui';

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

    const accounts = yield* Effect.tryPromise({
      try: () =>
        params.client.connectedAccounts.list({
          toolkit_slugs: [toolkitSlug],
          user_ids: [params.userId],
          statuses: ['ACTIVE'],
          limit: 100,
        }),
      catch: cause =>
        new ConnectedAccountResolutionError({
          message: `Failed to load connected accounts for toolkit "${toolkitSlug}": ${String(cause)}`,
          toolkitSlug,
          cause,
        }),
    });
    const selectableAccounts = yield* decodeConnectedAccountItems(accounts.items).pipe(
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
