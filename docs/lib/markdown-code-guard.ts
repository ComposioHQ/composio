/**
 * Apply a text transform only outside Markdown fenced code blocks and inline
 * code spans, so JSX-stripping passes never mangle generic type parameters
 * (e.g. `Promise<WebhookEndpoint>`) or code examples.
 */
function transformOutsideInlineCode(text: string, transform: (segment: string) => string): string {
  let out = '';
  let plainStart = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '`') {
      i += 1;
      continue;
    }

    let tickEnd = i;
    while (tickEnd < text.length && text[tickEnd] === '`') tickEnd += 1;
    const tickCount = tickEnd - i;

    let closeStart = -1;
    let j = tickEnd;
    while (j < text.length) {
      if (text[j] !== '`') {
        j += 1;
        continue;
      }
      let runEnd = j;
      while (runEnd < text.length && text[runEnd] === '`') runEnd += 1;
      if (runEnd - j === tickCount) {
        closeStart = j;
        break;
      }
      j = runEnd;
    }

    if (closeStart === -1) {
      i = tickEnd;
      continue;
    }

    if (i > plainStart) out += transform(text.slice(plainStart, i));
    const spanEnd = closeStart + tickCount;
    out += text.slice(i, spanEnd);
    i = spanEnd;
    plainStart = spanEnd;
  }

  if (plainStart < text.length) out += transform(text.slice(plainStart));
  return out;
}

export function stripTagsOutsideCode(markdown: string, pattern: RegExp): string {
  return replaceOutsideCode(markdown, segment => {
    let current = segment;
    let next = current.replace(pattern, '');
    while (next !== current) {
      current = next;
      next = current.replace(pattern, '');
    }
    return current;
  });
}

export function replaceOutsideCode(
  markdown: string,
  transform: (segment: string) => string
): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let plainLines: string[] = [];
  let fenceChar: '`' | '~' | null = null;
  let fenceLength = 0;

  const flushPlain = () => {
    if (plainLines.length === 0) return;
    output.push(transformOutsideInlineCode(plainLines.join('\n'), transform));
    plainLines = [];
  };

  for (const line of lines) {
    if (fenceChar === null) {
      const open = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && (open[1][0] === '~' || !open[2].includes('`'))) {
        flushPlain();
        fenceChar = open[1][0] as '`' | '~';
        fenceLength = open[1].length;
        output.push(line);
      } else {
        plainLines.push(line);
      }
    } else {
      output.push(line);
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLength) {
        fenceChar = null;
        fenceLength = 0;
      }
    }
  }

  flushPlain();
  return output.join('\n');
}
