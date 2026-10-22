const REMOTE_CUSTOM_PREFIX = 'CUSTOM_';

/**
 * Whether a toolkit slug names a project-scoped custom MCP toolkit (e.g. `custom_grain`).
 *
 * These toolkits are served by the Tool Router session, not the REST tools index.
 * Native toolkits whose slug merely starts with "custom" (`customerio`, `customgpt`, ...)
 * do not match, because they lack the `custom_` separator.
 */
export const isRemoteCustomToolkitSlug = (slug: string): boolean => {
  const normalized = slug.toUpperCase();
  return (
    normalized.startsWith(REMOTE_CUSTOM_PREFIX) && normalized.length > REMOTE_CUSTOM_PREFIX.length
  );
};

/**
 * Whether a tool slug belongs to a remote custom toolkit (e.g. `CUSTOM_GRAIN_SEARCH_PERSONS`).
 * Tool slugs carry their toolkit slug as a prefix, so the toolkit predicate applies directly.
 */
export const isRemoteCustomToolSlug = (slug: string): boolean => isRemoteCustomToolkitSlug(slug);
