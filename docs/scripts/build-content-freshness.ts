import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  source, getReferenceSource, examplesSource, toolkitsSource,
  changelogEntries, dateToChangelogUrl,
} from '../lib/source';
import {
  buildContentFreshness, getExplicitLastUpdated, type FreshnessPage,
} from '../lib/content-freshness-build';

const root = process.cwd();
const pages = new Map<string, FreshnessPage>();
const explicitSources: Record<string, string> = {};

function add(pathname: string, sources: string[]) {
  const current = pages.get(pathname);
  pages.set(pathname, { pathname, sources: [...new Set([...(current?.sources ?? []), ...sources])] });
}

function authored(pathname: string, absolutePath?: string) {
  if (!absolutePath || !existsSync(absolutePath)) return;
  const raw = readFileSync(absolutePath, 'utf8');
  // Generated files can change when an unrelated catalog entry changes.
  if (raw.includes('Auto-generated')) return;
  const explicit = getExplicitLastUpdated(raw);
  if (explicit !== undefined) explicitSources[resolve(absolutePath)] = explicit;
  add(pathname, [absolutePath]);
}

for (const collection of [source, examplesSource, toolkitsSource]) {
  for (const page of collection.getPages()) authored(page.url, page.absolutePath);
}

const reference = await getReferenceSource();
for (const page of reference.getPages()) {
  authored(page.url, page.absolutePath);
}

for (const entry of changelogEntries) {
  const file = join(root, 'content/changelog', entry.info.path);
  const filenameDate = entry.info.path.match(/^(\d{2})-(\d{2})-(\d{2})(?:-|\.)/);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date
    : filenameDate ? `20${filenameDate[3]}-${filenameDate[1]}-${filenameDate[2]}` : null;
  if (date) authored(dateToChangelogUrl(date), file);
}

// Browse pages include data outside their authored MDX. Omit freshness until
// changes can be attributed to the page instead of an entire shared corpus.
for (const pathname of ['/docs', '/examples', '/toolkits', '/toolkits/managed-auth',
  '/reference', '/reference/v3']) {
  pages.delete(pathname);
}

const manifest = buildContentFreshness(root, [...pages.values()], explicitSources);
const output = join(root, '.generated/content-freshness.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Persisted trustworthy freshness for ${Object.keys(manifest.pages).length} pages.`);
