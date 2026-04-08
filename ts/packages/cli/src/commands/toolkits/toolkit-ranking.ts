import type { Toolkit, ToolkitSearchResult } from 'src/models/toolkits';

/**
 * Pattern matching single toolkit slug identifiers (alphanumeric, hyphens, underscores).
 */
export const SINGLE_TOOLKIT_QUERY_PATTERN = /^[a-z0-9_-]+$/i;

/**
 * Returns true when a query looks like a single toolkit slug (no spaces, alphanumeric).
 */
export const isSingleSlugQuery = (query?: string): boolean => {
  const normalized = query?.trim();
  return (
    normalized !== undefined &&
    normalized.length > 0 &&
    !/\s/.test(normalized) &&
    SINGLE_TOOLKIT_QUERY_PATTERN.test(normalized)
  );
};

/**
 * Rank a toolkit against a query string. Returns a rank (0 = exact match, higher = weaker)
 * or `undefined` if no match. Checks slug, name, and description fields.
 */
export const rankToolkit = (toolkit: Toolkit, query: string): number | undefined => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const rankValue = (value: string) => {
    const normalizedValue = value.toLowerCase();
    if (normalizedValue === normalizedQuery) return 0;
    if (normalizedValue.startsWith(normalizedQuery)) return 1;

    const words = normalizedValue.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some(word => word === normalizedQuery)) return 2;
    if (words.some(word => word.startsWith(normalizedQuery))) return 3;
    if (normalizedValue.includes(normalizedQuery)) return 4;

    return undefined;
  };

  const slugRank = rankValue(toolkit.slug);
  const nameRank = rankValue(toolkit.name);
  const descriptionRank = rankValue(toolkit.meta.description);

  return [slugRank, nameRank, descriptionRank].reduce<number | undefined>(
    (currentBest, candidate) => {
      if (candidate === undefined) return currentBest;
      if (currentBest === undefined) return candidate;
      return Math.min(currentBest, candidate);
    },
    undefined
  );
};

/**
 * Filter and rank toolkits by a query string. Returns matched toolkits sorted by relevance.
 */
export const filterToolkitsByQuery = (
  toolkits: ReadonlyArray<Toolkit>,
  query?: string
): ReadonlyArray<Toolkit> => {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) return toolkits;

  return toolkits
    .map(toolkit => {
      const bestRank = rankToolkit(toolkit, normalizedQuery);
      return bestRank === undefined ? undefined : { toolkit, bestRank };
    })
    .filter((value): value is { toolkit: Toolkit; bestRank: number } => value !== undefined)
    .sort((left, right) => {
      if (left.bestRank !== right.bestRank) return left.bestRank - right.bestRank;
      return left.toolkit.slug.localeCompare(right.toolkit.slug);
    })
    .map(({ toolkit }) => toolkit);
};

/**
 * Build a `ToolkitSearchResult` from a pre-filtered array of toolkits.
 */
export const buildCatalogResultFromToolkits = (
  toolkits: ReadonlyArray<Toolkit>,
  limit: number
): ToolkitSearchResult => ({
  items: toolkits.slice(0, limit),
  total_items: toolkits.length,
  total_pages: toolkits.length === 0 ? 0 : Math.ceil(toolkits.length / limit),
  next_cursor: null,
});
