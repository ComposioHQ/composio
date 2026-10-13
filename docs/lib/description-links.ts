export interface DescriptionPart {
  text: string;
  href?: string;
}

/** Linkify web addresses in plain-text toolkit descriptions without interpreting HTML. */
export function descriptionLinks(description: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  const addresses = /(?<![\w@./-])(?:https?:\/\/[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#][^\s<>"']*)?)/gi;
  let cursor = 0;

  for (const match of description.matchAll(addresses)) {
    let text = match[0].replace(/[.,!?:;]+$/, '');
    // Keep balanced parentheses in URL paths, but leave prose delimiters outside links.
    while (text.endsWith(')') && text.split(')').length > text.split('(').length) {
      text = text.slice(0, -1);
    }
    text = text.replace(/[\]}]+$/, '');
    const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    try {
      new URL(href);
    } catch {
      continue;
    }

    if (match.index > cursor) parts.push({ text: description.slice(cursor, match.index) });
    parts.push({ text, href });
    cursor = match.index + text.length;
  }

  if (cursor < description.length) parts.push({ text: description.slice(cursor) });
  return parts;
}
