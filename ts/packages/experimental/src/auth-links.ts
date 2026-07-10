import { configure } from 'safe-stable-stringify';

const HTTPS_PREFIX = 'https://';
const CONNECT_LINK_PREFIX = 'https://connect.composio.dev/';
const COMPOSIO_MARKER = 'composio';
const LINK_PATH_MARKER = '/link/';
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
  const normalizedToken = token.toLowerCase();
  const httpsStart = normalizedToken.indexOf(HTTPS_PREFIX);
  if (httpsStart === -1) return;

  const connectStart = normalizedToken.indexOf(CONNECT_LINK_PREFIX, httpsStart);
  if (connectStart !== -1 && connectStart + CONNECT_LINK_PREFIX.length < token.length) {
    connectLinks.add(trimTrailingPunctuation(token.slice(connectStart)));
  }

  const composioStart = normalizedToken.indexOf(COMPOSIO_MARKER, httpsStart + HTTPS_PREFIX.length);
  if (composioStart === -1) return;

  const linkPathStart = normalizedToken.indexOf(
    LINK_PATH_MARKER,
    composioStart + COMPOSIO_MARKER.length
  );
  if (linkPathStart === -1 || linkPathStart + LINK_PATH_MARKER.length >= token.length) return;

  genericLinks.add(trimTrailingPunctuation(token.slice(httpsStart)));
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

  return Array.from(new Set([...connectLinks, ...genericLinks]));
};
