import type { TriggerListenEvent, TriggerListenFilters } from './types';

/**
 * Check if a trigger event matches the provided filters.
 * All string comparisons on `toolkits` and `triggerSlug` are case-insensitive.
 */
export const matchesTriggerListenFilters = (
  filters: TriggerListenFilters,
  data: TriggerListenEvent
): boolean => {
  if (
    filters.toolkits?.length &&
    !filters.toolkits.some(t => t.toLowerCase() === data.toolkitSlug.toLowerCase())
  ) {
    return false;
  }

  if (filters.triggerId && filters.triggerId !== data.id) {
    return false;
  }

  if (
    filters.connectedAccountId &&
    filters.connectedAccountId !== data.metadata.connectedAccount.id
  ) {
    return false;
  }

  if (
    filters.triggerSlug?.length &&
    !filters.triggerSlug.some(s => s.toLowerCase() === data.triggerSlug.toLowerCase())
  ) {
    return false;
  }

  if (filters.userId && filters.userId !== data.userId) {
    return false;
  }

  return true;
};
