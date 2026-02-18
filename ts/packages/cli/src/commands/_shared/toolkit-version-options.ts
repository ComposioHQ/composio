import { Effect } from 'effect';
import { getToolkitVersionOverrides } from 'src/effects/toolkit-version-overrides';
import type { ToolkitVersionOverrides } from 'src/effects/toolkit-version-overrides';

export function pickToolkitVersionOverrides(
  overrides: ToolkitVersionOverrides,
  toolkitSlugs: ReadonlyArray<string>
): ToolkitVersionOverrides {
  if (toolkitSlugs.length === 0) {
    return overrides;
  }

  const normalizedToolkitSlugs = new Set(toolkitSlugs.map(slug => slug.toLowerCase()));
  const filtered = new Map<Lowercase<string>, string>();

  for (const [toolkitSlug, toolkitVersion] of overrides.entries()) {
    if (normalizedToolkitSlugs.has(toolkitSlug)) {
      filtered.set(toolkitSlug, toolkitVersion);
    }
  }

  return filtered;
}

export function getToolkitVersionQueryParam(
  toolkitSlugs: ReadonlyArray<string>
): Effect.Effect<Record<string, string> | undefined, unknown> {
  return Effect.gen(function* () {
    const overrides = yield* getToolkitVersionOverrides;
    const filteredOverrides = pickToolkitVersionOverrides(overrides, toolkitSlugs);

    if (filteredOverrides.size === 0) {
      return undefined;
    }

    return Object.fromEntries(filteredOverrides.entries());
  });
}
