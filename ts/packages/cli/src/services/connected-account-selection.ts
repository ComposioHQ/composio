import type { ConnectedAccountItem } from 'src/models/connected-accounts';

export type CachedConnectedAccountSummary = {
  readonly id: string;
  readonly alias: string | null;
  readonly wordId: string | null;
  readonly updatedAt: string;
  readonly createdAt: string;
};

const normalizeSelector = (value: string): string => value.trim().toLowerCase();

const parseTimestamp = (value: string | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compareNewestFirst = (
  left: Pick<ConnectedAccountItem, 'updated_at' | 'created_at'>,
  right: Pick<ConnectedAccountItem, 'updated_at' | 'created_at'>
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
  item: Pick<ConnectedAccountItem, 'status' | 'is_disabled'>
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
  items: ReadonlyArray<ConnectedAccountItem>
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
  items: ReadonlyArray<ConnectedAccountItem>
): Record<string, string> => {
  const grouped = new Map<string, ConnectedAccountItem[]>();

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
  items: ReadonlyArray<ConnectedAccountItem>,
  selector?: string
): ConnectedAccountItem | undefined => {
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
