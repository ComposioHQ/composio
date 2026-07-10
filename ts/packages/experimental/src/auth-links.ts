import { configure } from 'safe-stable-stringify';

const CONNECT_LINK = /https:\/\/connect\.composio\.dev\/[^\s<>)"']+/gi;
const GENERIC_LINK = /https:\/\/[^\s<>)"']*composio[^\s<>)"']*\/link\/[^\s<>)"']+/gi;
const AUTH_LINK_PATTERNS = [CONNECT_LINK, GENERIC_LINK];
const stringify = configure({ deterministic: false });

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value;

  try {
    const serialized = stringify(value);
    if (serialized === undefined) return '';
    return serialized;
  } catch {
    return '';
  }
};

export const extractComposioConnectLinks = (value: unknown): string[] => {
  const text = stringifyUnknown(value);
  const links = new Set<string>();

  for (const pattern of AUTH_LINK_PATTERNS) {
    const matches = text.match(pattern);
    if (!matches) continue;

    for (const match of matches) {
      links.add(match.replace(/[.,;:!?]+$/g, ''));
    }
  }

  return Array.from(links);
};
