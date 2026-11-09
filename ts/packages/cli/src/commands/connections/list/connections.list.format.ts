import type { ConnectedAccountItem } from 'src/models/connected-accounts';

/**
 * The connections grouped by toolkit slug, as JSON for stdout, each with its permission group
 * (null when none).
 */
export const formatConnectionsJson = (
  items: ReadonlyArray<ConnectedAccountItem>,
  permissionGroups: ReadonlyMap<string, string | undefined> = new Map()
): string => {
  const toolkitCounts = items.reduce<Map<string, number>>((acc, item) => {
    acc.set(item.toolkit.slug, (acc.get(item.toolkit.slug) ?? 0) + 1);
    return acc;
  }, new Map());

  const grouped = items.reduce<
    Record<
      string,
      Array<{
        id: string;
        status: string;
        alias?: string | null;
        word_id?: string | null;
        display_name?: string;
        permission_group: string | null;
      }>
    >
  >((acc, item) => {
    const toolkit = item.toolkit.slug;
    // Several accounts for one toolkit keep `alias` on every entry (null when
    // unset); a lone account prints it only when it actually has one.
    const includeAlias = item.alias != null || (toolkitCounts.get(toolkit) ?? 0) > 1;
    const entry = {
      id: item.id,
      status: item.status,
      ...(includeAlias ? { alias: item.alias ?? null } : {}),
      ...(item.word_id != null ? { word_id: item.word_id } : {}),
      ...(item.display_name !== undefined ? { display_name: item.display_name } : {}),
      permission_group: permissionGroups.get(item.id) ?? null,
    };

    if (!acc[toolkit]) {
      acc[toolkit] = [];
    }
    acc[toolkit].push(entry);
    return acc;
  }, {});

  return JSON.stringify(grouped, null, 2);
};
