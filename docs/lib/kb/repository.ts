import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildKbCatalog } from './catalog';
import type { KbCatalog, KbGuide, KbManifest } from './types';

const KB_ROOT = fileURLToPath(new URL('../../kb', import.meta.url));
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
  const primaryTopic = guide.topics[0];
  if (!primaryTopic) throw new Error(`${guide.slug} requires at least one topic`);
  return `/kb/${primaryTopic}/${guide.slug}`;
}

export function resolveKbAlias(path: string, catalog = getKbCatalog()): string | null {
  const normalized = path.replace(/^\/+|\/+$/g, '').toLowerCase();
  const guide = getPublishedKbGuides(catalog).find((candidate) =>
    candidate.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
  return guide ? getKbGuideUrl(guide) : null;
}

