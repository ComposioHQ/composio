/**
 * Last-resort guess: the text before the first underscore. Multi-word toolkit
 * slugs (e.g. `google_analytics` in `GOOGLE_ANALYTICS_RUN_REPORT`) cannot be
 * recovered from the tool slug alone, so prefer `toolkitFromToolSlug` from
 * `src/effects/toolkit-from-tool-slug`, which matches against the known
 * toolkit list and only falls back to this guess when that list is
 * unavailable.
 */
export const guessToolkitFromToolSlug = (toolSlug: string): string | undefined => {
  const idx = toolSlug.indexOf('_');
  if (idx <= 0) return toolSlug.toLowerCase();
  const prefix = toolSlug.slice(0, idx).toLowerCase();
  return prefix === 'composio' ? undefined : prefix;
};

/**
 * Longest-prefix search over the tool slug's underscore boundaries: for
 * `A_B_C_D` the candidates are `a_b_c`, then `a_b`, then `a`, and the first
 * candidate present in the known toolkit list wins — so
 * `GOOGLE_ANALYTICS_RUN_REPORT` resolves to `google_analytics` even when
 * `google` is also a known toolkit. Returns undefined when no candidate is
 * known.
 */
export const longestPrefix = (
  toolSlug: string,
  knownToolkitSlugs: ReadonlyArray<string>
): string | undefined => {
  const known = new Set(knownToolkitSlugs.map(slug => slug.toLowerCase()));
  const segments = toolSlug.toLowerCase().split('_');
  for (let end = segments.length - 1; end >= 1; end -= 1) {
    const candidate = segments.slice(0, end).join('_');
    if (known.has(candidate)) return candidate;
  }
  return undefined;
};

/**
 * `longestPrefix` with the toolkit-resolution policy applied on top: the
 * `composio` meta guard, and `guessToolkitFromToolSlug` when no candidate is
 * known.
 */
export const matchToolkitFromToolSlug = (
  toolSlug: string,
  knownToolkitSlugs: ReadonlyArray<string>
): string | undefined => {
  const match = longestPrefix(toolSlug, knownToolkitSlugs);
  if (match !== undefined) {
    // Bare `composio`-prefixed slugs are meta tools, not user-linkable
    // toolkits; longer matches such as `composio_search` are real toolkits.
    return match === 'composio' ? undefined : match;
  }
  return guessToolkitFromToolSlug(toolSlug);
};
