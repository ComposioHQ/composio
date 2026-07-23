import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildKbCatalog } from './catalog';
import type { KbCatalog, KbGuide, KbManifest } from './types';

const KB_ROOT = join(process.cwd(), 'kb');
let cachedCatalog: KbCatalog | null = null;

export function getKbCatalog(): KbCatalog {
  if (cachedCatalog) return cachedCatalog;
  const manifest = JSON.parse(readFileSync(join(KB_ROOT, 'manifest.json'), 'utf8')) as KbManifest;
  cachedCatalog = buildKbCatalog(
    manifest,
    (sourcePath) => readFileSync(join(KB_ROOT, 'source', sourcePath), 'utf8'),
    new Date(),
  );
  return cachedCatalog;
}

export function getPublishedKbGuides(catalog = getKbCatalog()): KbGuide[] {
  return catalog.guides.filter((guide) => guide.state === 'published');
}

export function getKbGuideUrl(guide: KbGuide): string {
  return `/kb/guide/${guide.slug}`;
}

export function getKbLegacySegments(catalog = getKbCatalog()): string[][] {
  const paths = getPublishedKbGuides(catalog).flatMap((guide) => {
    const primaryTopic = guide.topics[0];
    const primaryPath = primaryTopic ? [`/kb/${primaryTopic}/${guide.slug}`] : [];
    return [...primaryPath, ...guide.aliases];
  });

  return Array.from(
    new Set(
      paths
        .map((path) => path.replace(/^\/+|\/+$/g, ''))
        .filter((path) => path.startsWith('kb/') && !path.startsWith('kb/guide/')),
    ),
  ).map((path) => path.slice('kb/'.length).split('/'));
}

export function resolveKbAlias(path: string, catalog = getKbCatalog()): string | null {
  const normalized = path.replace(/^\/+|\/+$/g, '').toLowerCase();
  const guide = getPublishedKbGuides(catalog).find((candidate) => {
    const primaryTopic = candidate.topics[0];
    const legacyPath = primaryTopic ? `kb/${primaryTopic}/${candidate.slug}` : null;
    const canonicalPath = getKbGuideUrl(candidate).replace(/^\//, '');
    return (
      normalized === legacyPath ||
      normalized === canonicalPath ||
      candidate.aliases.some(
        (alias) => alias.replace(/^\/+|\/+$/g, '').toLowerCase() === normalized,
      )
    );
  });
  return guide ? getKbGuideUrl(guide) : null;
}
