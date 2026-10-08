import type { SessionExecuteMetaParams } from '@composio/client/resources/tool-router';

/**
 * Meta tool slugs handled by `session.executeMeta` instead of `session.execute`.
 *
 * The `satisfies` constraint ensures this list stays in sync with the API's
 * `SessionExecuteMetaParams['slug']` union — a compile error will surface if
 * a slug is misspelled or if the API adds/removes a meta tool.
 */
const META_TOOL_SLUG_LIST: ReadonlyArray<SessionExecuteMetaParams['slug']> = [
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_MULTI_EXECUTE_TOOL',
  'COMPOSIO_MANAGE_CONNECTIONS',
  'COMPOSIO_WAIT_FOR_CONNECTIONS',
  'COMPOSIO_REMOTE_WORKBENCH',
  'COMPOSIO_REMOTE_BASH_TOOL',
  'COMPOSIO_GET_TOOL_SCHEMAS',
];

const META_TOOL_SLUGS: ReadonlySet<string> = new Set(META_TOOL_SLUG_LIST);

/**
 * Meta tools belong to the session, not to any toolkit — nothing to link, and
 * nothing to attribute them to. Their slugs shadow real toolkits
 * (`COMPOSIO_SEARCH_TOOLS` looks like a tool of the `composio_search`
 * toolkit), so anything deriving a toolkit from a slug must check this first.
 */
export const isMetaToolSlug = (slug: string): slug is SessionExecuteMetaParams['slug'] =>
  META_TOOL_SLUGS.has(slug.toUpperCase());
