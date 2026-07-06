type TocEntry = {
  title?: unknown;
  children?: TocEntry[];
  items?: TocEntry[];
  [key: string]: unknown;
};

function sanitizeTitle(title: unknown) {
  if (typeof title !== 'string') return title;
  return title.replace(/\s+\(?(Experimental|Legacy)\)?\s*$/i, '').trim();
}

function sanitizeEntry(entry: TocEntry): TocEntry {
  return {
    ...entry,
    title: sanitizeTitle(entry.title),
    children: entry.children?.map(sanitizeEntry),
    items: entry.items?.map(sanitizeEntry),
  };
}

export function sanitizeToc<T>(toc: T): T {
  if (!Array.isArray(toc)) return toc;
  return toc.map((entry) => sanitizeEntry(entry as TocEntry)) as T;
}
