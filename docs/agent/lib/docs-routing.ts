type CanonicalRouteRule = {
  route: string;
  matches: (query: string) => boolean;
};

const CANONICAL_ROUTE_RULES: CanonicalRouteRule[] = [
  {
    route: '/docs/tools-direct/executing-tools',
    matches: query => /\bcomposio\s*\.\s*tools\s*\.\s*execute\s*\(/i.test(query),
  },
  {
    route: '/docs/composio-connect',
    matches: query => {
      const normalized = query.toLowerCase();
      if (!/\bmcp\b/.test(normalized)) return false;

      const hasExistingClient =
        /\b(?:already have|existing)\b.{0,48}\b(?:mcp\s+)?client\b/.test(normalized) ||
        /\b(?:mcp\s+)?client\b.{0,48}\b(?:already have|existing)\b/.test(normalized);
      const rejectsSdkSession =
        /\bnot\s+(?:an?\s+)?(?:sdk\s+)?session\b/.test(normalized) ||
        /\bwithout\s+(?:an?\s+)?(?:sdk\s+)?session\b/.test(normalized);

      return hasExistingClient || rejectsSdkSession;
    },
  },
];

export function canonicalRouteForQuery(query: string): string | undefined {
  return CANONICAL_ROUTE_RULES.find(rule => rule.matches(query))?.route;
}

export function promoteCanonicalRoute<T>(
  ranked: T[],
  route: string | undefined,
  routeFor: (item: T) => string
): T[] {
  if (!route) return ranked;

  const existingIndex = ranked.findIndex(item => routeFor(item) === route);
  if (existingIndex <= 0) return ranked;

  return [ranked[existingIndex]!, ...ranked.slice(0, existingIndex), ...ranked.slice(existingIndex + 1)];
}
