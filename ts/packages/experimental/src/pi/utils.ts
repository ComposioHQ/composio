import type { PiSessionToolOptions } from './types';

export const normalizeToolkits = (value: unknown): string[] | undefined => {
  const toolkits = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string' && value.trim().length > 0
      ? [value]
      : [];
  const unique = [...new Set(toolkits.map(toolkit => toolkit.trim()))];
  return unique.length > 0 ? unique : undefined;
};

export const maybeTransform = async (
  options: Pick<PiSessionToolOptions, 'transformResult'>,
  params: Parameters<NonNullable<PiSessionToolOptions['transformResult']>>[0]
): Promise<unknown> => (options.transformResult ? options.transformResult(params) : params.value);

export const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export const toolkitFromToolSlug = (toolSlug: string): string | undefined => {
  const normalized = toolSlug.trim().toLowerCase();
  if (!normalized || normalized.startsWith('composio_')) return undefined;

  const knownPrefixes: Array<[string, string]> = [
    ['google_calendar_', 'googlecalendar'],
    ['google_drive_', 'googledrive'],
    ['microsoft_teams_', 'microsoftteams'],
  ];
  for (const [prefix, toolkit] of knownPrefixes) {
    if (normalized.startsWith(prefix)) return toolkit;
  }

  const [prefix] = normalized.split('_');
  return prefix || undefined;
};
