import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const BROWSER_GRANT_TOOLKITS = [
  { exportPrefix: 'GMAIL', slug: 'gmail' },
  { slug: 'googledrive' },
  { exportPrefix: 'GITHUB', slug: 'github' },
  { exportPrefix: 'SLACK', slug: 'slack' },
];

export const DEMO_TOOLKIT = {
  exportPrefix: 'APIKEY',
  slug: 'serpapi',
  demoValue: 'examples-demo-key',
};

const parseCsv = value =>
  value
    ? value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    : [];

const toolkitForId = id => {
  for (const toolkit of [...BROWSER_GRANT_TOOLKITS, DEMO_TOOLKIT]) {
    if (toolkit.exportPrefix && id.startsWith(`COMPOSIO_EXAMPLES_${toolkit.exportPrefix}_`)) {
      return toolkit.slug;
    }
  }
  return undefined;
};

export const entryToolkits = entry => {
  const toolkits = new Set(entry.toolkits ?? []);
  for (const id of entry.ids ?? []) {
    const toolkit = toolkitForId(id);
    if (toolkit) toolkits.add(toolkit);
  }
  return [...toolkits];
};

export const loadManifest = () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'examples-manifest.json'), 'utf8'));
  for (const entry of manifest.entries) {
    if (!entry.id || !entry.lang || !entry.file || !entry.tier) {
      throw new Error(`manifest entry missing required fields: ${JSON.stringify(entry)}`);
    }
    if (entry.lang === 'ts' && entry.tier !== 'X' && !entry.pkg) {
      throw new Error(`ts entry ${entry.id} missing pkg`);
    }
    if (entry.tier === '3' && !entry.readiness) {
      throw new Error(`tier-3 entry ${entry.id} missing readiness regex`);
    }
  }
  return manifest.entries;
};

export const selectManifestEntries = (
  entries,
  { lang, ids, tiers = '1,2,3', excludeToolkits } = {}
) => {
  const selectedIds = new Set(parseCsv(ids));
  const selectedTiers = new Set(parseCsv(tiers));
  const excludedToolkitSet = new Set(parseCsv(excludeToolkits));
  const eligibleEntries = entries.filter(
    entry =>
      entry.tier !== 'X' &&
      selectedTiers.has(entry.tier) &&
      (!lang || entry.lang === lang) &&
      (selectedIds.size === 0 || selectedIds.has(entry.id))
  );
  const excludedEntries = eligibleEntries.filter(entry =>
    entryToolkits(entry).some(toolkit => excludedToolkitSet.has(toolkit))
  );
  const excludedIds = new Set(excludedEntries.map(entry => entry.id));

  return {
    entries: eligibleEntries.filter(entry => !excludedIds.has(entry.id)),
    excludedEntries,
    excludedToolkits: [...excludedToolkitSet],
  };
};

export const requiredBrowserGrantToolkits = entries =>
  BROWSER_GRANT_TOOLKITS.filter(toolkit =>
    entries.some(entry => entryToolkits(entry).includes(toolkit.slug))
  );

export const requiresDemoToolkit = entries =>
  entries.some(entry => entryToolkits(entry).includes(DEMO_TOOLKIT.slug));
