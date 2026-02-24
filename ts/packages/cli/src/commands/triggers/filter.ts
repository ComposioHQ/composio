import type { TriggerListenEvent, TriggerListenFilters } from './types';

export const matchesTriggerListenFilters = (
  filters: TriggerListenFilters,
  data: TriggerListenEvent
): boolean => {
  if (
    filters.toolkits?.length &&
    !filters.toolkits.map(x => x.toLowerCase()).includes(data.toolkitSlug.toLowerCase())
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
    !filters.triggerSlug.map(x => x.toLowerCase()).includes(data.triggerSlug.toLowerCase())
  ) {
    return false;
  }

  if (filters.userId && filters.userId !== data.userId) {
    return false;
  }

  return true;
};
