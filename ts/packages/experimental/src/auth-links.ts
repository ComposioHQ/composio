import { configure } from 'safe-stable-stringify';

const stringify = configure({ deterministic: false });

function resultText(value: unknown): string {
  if (typeof value === 'string') return value;

  try {
    return stringify(value) ?? '';
  } catch {
    return '';
  }
}

function stripTrailingPunctuation(link: string): string {
  let end = link.length;
  while (end > 0 && '.,;:!?'.includes(link.charAt(end - 1))) {
    end -= 1;
  }
  return link.slice(0, end);
}

export function extractComposioConnectLinks(value: unknown): string[] {
  const connectLinks = new Set<string>();
  const genericLinks = new Set<string>();

  for (const [candidate] of resultText(value).matchAll(/https:\/\/[^\s<>)"']+/gi)) {
    const link = stripTrailingPunctuation(candidate);
    // We return the original spelling, so reject backslashes that URL parsing can normalize.
    if (link.includes('\\')) continue;

    const url = URL.parse(link);
    if (!url || url.username || url.password || url.port) continue;

    const { hostname, pathname } = url;
    if (hostname === 'connect.composio.dev' && pathname !== '/') {
      connectLinks.add(link);
    } else if (
      (hostname === 'composio.dev' || hostname.endsWith('.composio.dev')) &&
      /^\/link\/./i.test(pathname)
    ) {
      genericLinks.add(link);
    }
  }

  return [...connectLinks, ...genericLinks];
}
