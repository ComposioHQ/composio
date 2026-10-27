import type { TriggerListenEvent, TriggerListenFilters } from './types';

/**
 * Payloads don't carry the toolkit slug, so `data.toolkitSlug` is the trigger slug's
 * first `_` segment, which is wrong for toolkits whose slug contains an underscore
 * (`ONE_DRIVE_FILE_CREATED_TRIGGER` gives `ONE`). Trigger slugs start with
 * `<TOOLKIT>_`, so a toolkit also matches on that prefix.
 */
const matchesToolkit = (toolkit: string, data: TriggerListenEvent): boolean => {
  const filter = toolkit.toLowerCase();
  return (
    filter === data.toolkitSlug.toLowerCase() ||
    data.triggerSlug.toLowerCase().startsWith(`${filter}_`)
  );
};

/**
 * Check if a trigger event matches the provided filters.
 * All string comparisons on `toolkits` and `triggerSlug` are case-insensitive.
 */
export const matchesTriggerListenFilters = (
  filters: TriggerListenFilters,
  data: TriggerListenEvent
): boolean => {
  if (filters.toolkits?.length && !filters.toolkits.some(t => matchesToolkit(t, data))) {
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
