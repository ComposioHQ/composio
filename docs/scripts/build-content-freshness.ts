import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  source, getReferenceSource, examplesSource, toolkitsSource, knowledgeBaseSource,
  changelogEntries, dateToChangelogUrl,
} from '../lib/source';
import { getAllToolkitsSync } from '../lib/toolkit-data';
import { getLocalKnowledgeDiscoveryPaths } from '../lib/knowledge/discovery';
import { getPublishedKbGuides, getKbGuideUrl } from '../lib/kb/repository';
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
  const explicit = getExplicitLastUpdated(raw);
  if (explicit !== undefined) explicitSources[resolve(absolutePath)] = explicit;
  add(pathname, [absolutePath]);
}

for (const collection of [source, examplesSource, toolkitsSource, knowledgeBaseSource]) {
  for (const page of collection.getPages()) authored(page.url, page.absolutePath);
}

const reference = await getReferenceSource();
for (const page of reference.getPages()) {
  const spec = page.url.startsWith('/reference/v3/') ? 'public/openapi-v3.json'
    : page.url.includes('/webhook-events') ? 'public/openapi-webhooks.json'
    : 'public/openapi.json';
  const raw = page.absolutePath && existsSync(page.absolutePath)
    ? readFileSync(page.absolutePath, 'utf8') : null;
  if (raw?.includes('Auto-generated from')) {
    const tag = page.url.split('/').at(-1);
    const overview = `api-overviews/${tag}.mdx`;
    const specs = spec === 'public/openapi-webhooks.json' ? [spec]
      : ['public/openapi.json', 'public/openapi-v3.json'];
    add(page.url, [...specs, 'scripts/generate-api-index.ts',
      ...(existsSync(join(root, overview)) ? [overview] : [])]);
  } else if (raw !== null) {
    authored(page.url, page.absolutePath);
  } else {
    add(page.url, [spec, 'lib/openapi.ts']);
  }
}

for (const toolkit of getAllToolkitsSync()) {
  add(`/toolkits/${toolkit.slug}`, ['public/data/toolkits.json']);
}

// Generated MDX is a presentation artifact. Use the actual KB articles and sources.
for (const guide of getPublishedKbGuides()) {
  const pathname = getKbGuideUrl(guide);
  pages.delete(pathname);
  add(pathname, [
    'kb/manifest.json',
    ...guide.sources.map(source => `kb/source/${source.sourcePath}`),
    ...(guide.articlePath ? [`kb/articles/${guide.articlePath}`] : []),
  ]);
}

const changelogSources: string[] = [];
for (const entry of changelogEntries) {
  const file = join(root, 'content/changelog', entry.info.path);
  const filenameDate = entry.info.path.match(/^(\d{2})-(\d{2})-(\d{2})(?:-|\.)/);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date
    : filenameDate ? `20${filenameDate[3]}-${filenameDate[1]}-${filenameDate[2]}` : null;
  if (date) authored(dateToChangelogUrl(date), file);
  changelogSources.push(file);
}
add('/docs/changelog', changelogSources);
add('/', ['app/(home)/page.tsx', ...(pages.get('/docs')?.sources ?? [])]);

// These browse pages are aggregates over the local knowledge corpus. Require all
// backing timestamps rather than claim a partially-known maximum is authoritative.
pages.delete('/kb');
const corpusSources = [...pages.values()].flatMap(page => page.sources);
for (const pathname of await getLocalKnowledgeDiscoveryPaths()) {
  if (pathname === '/kb/search' || pathname.startsWith('/kb/guide/')) continue;
  add(pathname, [...corpusSources, 'public/data/toolkits-list.json', 'lib/knowledge/taxonomy.ts']);
}
const toolkitSources = getAllToolkitsSync().length > 0 ? ['public/data/toolkits.json'] : [];
if (pages.has('/toolkits')) add('/toolkits', toolkitSources);
if (pages.has('/toolkits/managed-auth')) add('/toolkits/managed-auth', toolkitSources);
for (const pathname of pages.keys()) {
  if (pathname === '/toolkits/meta-tools' || pathname.startsWith('/toolkits/meta-tools/')) {
    add(pathname, ['public/data/meta-tools.json', 'lib/meta-tool-overrides.ts']);
  }
}
if (pages.has('/examples')) {
  add('/examples', [...pages.values()].filter(page => page.pathname.startsWith('/examples/'))
    .flatMap(page => page.sources));
}

const manifest = buildContentFreshness(root, [...pages.values()], explicitSources);
const output = join(root, '.generated/content-freshness.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Persisted trustworthy freshness for ${Object.keys(manifest.pages).length} pages.`);
