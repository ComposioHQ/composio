import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HarnessError } from './errors.mjs';

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

export const validateManifestEntries = entries => {
  for (const entry of entries) {
    if (!entry.id || !entry.lang || !entry.file || !entry.tier) {
      throw new HarnessError(`manifest entry missing required fields: ${JSON.stringify(entry)}`);
    }
    if (entry.lang === 'ts' && entry.tier !== 'X' && !entry.pkg) {
      throw new HarnessError(`ts entry ${entry.id} missing pkg`);
    }
    if (entry.tier === '3' && !entry.readiness) {
      throw new HarnessError(`tier-3 entry ${entry.id} missing readiness regex`);
    }
  }
  return entries;
};

export const loadManifest = () =>
  validateManifestEntries(
    JSON.parse(readFileSync(join(ROOT, 'examples-manifest.json'), 'utf8')).entries
  );

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

// Selection flags shared by harness/run.mjs and scripts/examples-provision.mjs:
// [--lang ts|py] [--ids a,b] [--tiers 1,2,3] [--exclude-toolkits a,b]
export const parseOption = (argv, name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};

export const parseSelectionOptions = argv => ({
  lang: parseOption(argv, 'lang'),
  ids: parseOption(argv, 'ids'),
  tiers: parseOption(argv, 'tiers', '1,2,3'),
  excludeToolkits: parseOption(argv, 'exclude-toolkits'),
});

// One line per excluded entry, preceded by a summary; empty when nothing was excluded.
export const describeExclusions = selection => {
  if (selection.excludedEntries.length === 0) return [];
  return [
    `excluding ${selection.excludedEntries.length} entries requiring ${selection.excludedToolkits.join(', ')}:`,
    ...selection.excludedEntries.map(entry => `  - ${entry.id}`),
  ];
};

// Names the exclusion as the cause when it emptied the selection, so an
// operator is not left with a bare "no entries selected".
export const emptySelectionMessage = (selection, subject = 'entries') => {
  const excluded = selection.excludedEntries;
  if (excluded.length === 0) return `no ${subject} selected`;
  return (
    `no ${subject} selected: --exclude-toolkits ${selection.excludedToolkits.join(',')} ` +
    `removed all ${excluded.length} matching ${subject} (${excluded.map(entry => entry.id).join(', ')})`
  );
};

export const requiredBrowserGrantToolkits = entries =>
  BROWSER_GRANT_TOOLKITS.filter(toolkit =>
    entries.some(entry => entryToolkits(entry).includes(toolkit.slug))
  );

export const requiresDemoToolkit = entries =>
  entries.some(entry => entryToolkits(entry).includes(DEMO_TOOLKIT.slug));
