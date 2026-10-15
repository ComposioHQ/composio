import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { assertPageFacts, parityPages } from '../tests/fixtures/semantic-parity';

// Accept retrieved text or an exported index, with chunks in their source order.
const snapshotSchema = z.object({
  surface: z.string().min(1),
  capturedAt: z.string().datetime(),
  includesLegacy: z.boolean(),
  pages: z.array(z.object({
    url: z.string().refine(value => {
      try {
        return new URL(value, 'https://docs.composio.dev').origin === 'https://docs.composio.dev';
      } catch {
        return false;
      }
    }, 'Expected a canonical docs.composio.dev URL or site path'),
    content: z.string(),
  })).min(1),
});

const path = process.argv[2];
if (!path) throw new Error('Usage: bun scripts/check-docs-parity.ts <snapshot.json>');
const snapshot = snapshotSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
const pages = new Map<string, string>();
for (const page of snapshot.pages) {
  const url = new URL(page.url, 'https://docs.composio.dev').pathname.replace(/\.mdx?$/, '').replace(/\/$/, '');
  pages.set(url, [pages.get(url), page.content].filter(Boolean).join('\n\n'));
}

const failures: string[] = [];
for (const page of parityPages) {
  if (!snapshot.includesLegacy && page.url.startsWith('/reference/v3/')) continue;
  try {
    assertPageFacts(pages.get(page.url) ?? '', page, snapshot.surface);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`${snapshot.surface}: parity passed for snapshot captured ${snapshot.capturedAt}`);
