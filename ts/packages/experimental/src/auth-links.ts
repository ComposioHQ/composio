import { configure } from 'safe-stable-stringify';

const HTTPS_PREFIX = 'https://';
const COMPOSIO_DOMAIN = 'composio.dev';
const CONNECT_HOST = `connect.${COMPOSIO_DOMAIN}`;
const URL_BOUNDARIES = new Set(['<', '>', ')', '"', "'"]);
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);
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

const isUrlBoundary = (character: string): boolean =>
  URL_BOUNDARIES.has(character) || character.trim().length === 0;

const trimTrailingPunctuation = (url: string): string => {
  let end = url.length;

  while (end > 0 && TRAILING_PUNCTUATION.has(url[end - 1]!)) {
    end -= 1;
  }

  return url.slice(0, end);
};

const classifyToken = (
  token: string,
  connectLinks: Set<string>,
  genericLinks: Set<string>
): void => {
  const httpsStart = token.toLowerCase().indexOf(HTTPS_PREFIX);
  if (httpsStart === -1) return;

  const link = trimTrailingPunctuation(token.slice(httpsStart));
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return;
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) return;

  const { hostname, pathname } = url;
  if (hostname === CONNECT_HOST && pathname.length > 1) {
    connectLinks.add(link);
  } else if (
    (hostname === COMPOSIO_DOMAIN || hostname.endsWith(`.${COMPOSIO_DOMAIN}`)) &&
    /\/link\/./i.test(pathname)
  ) {
    genericLinks.add(link);
  }
};

export const extractComposioConnectLinks = (value: unknown): string[] => {
  const text = stringifyUnknown(value);
  const connectLinks = new Set<string>();
  const genericLinks = new Set<string>();
  let tokenStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index];
    if (character !== undefined && !isUrlBoundary(character)) continue;

    if (index > tokenStart) {
      classifyToken(text.slice(tokenStart, index), connectLinks, genericLinks);
    }

    tokenStart = index + 1;
  }

  return [...connectLinks, ...genericLinks];
};
