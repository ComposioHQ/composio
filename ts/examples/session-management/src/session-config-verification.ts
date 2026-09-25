import type { SessionConfigs, SessionConfigListParams, SessionConfigSummary } from '@composio/core';

export async function listAllSessionConfigs(
  sessionConfigs: Pick<SessionConfigs, 'list'>,
  params: Pick<SessionConfigListParams, 'archived'> = {}
): Promise<SessionConfigSummary[]> {
  const items: SessionConfigSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await sessionConfigs.list({ ...params, limit: 100, cursor });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor !== undefined) {
      if (seenCursors.has(cursor))
        throw new Error(`Session config pagination repeated cursor: ${cursor}`);
      seenCursors.add(cursor);
    }
  } while (cursor !== undefined);
  return items;
}

export async function cleanupVerificationSessions(
  sessionIds: string[],
  deleteSession: (id: string) => Promise<{ deleted: boolean }>
): Promise<void> {
  const failures: Error[] = [];
  for (const id of sessionIds) {
    try {
      const result = await deleteSession(id);
      if (!result.deleted) throw new Error('API did not confirm deletion');
    } catch (cause) {
      failures.push(new Error(`Could not delete session ${id}`, { cause }));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, failures.map(error => error.message).join('; '));
  }
}
