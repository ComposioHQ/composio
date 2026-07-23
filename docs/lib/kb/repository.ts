import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildKbCatalog } from './catalog';
import type { KbCatalog, KbGuide, KbManifest } from './types';

const KB_ROOT = join(process.cwd(), 'kb');
const KB_ARTICLES_ROOT = resolve(KB_ROOT, 'articles');
let cachedCatalog: KbCatalog | null = null;

export function createKbArticleReader(articlesRoot: string): (articlePath: string) => string {
  return articlePath => {
    const articlesRootStats = lstatSync(articlesRoot);
    if (articlesRootStats.isSymbolicLink()) {
      throw new Error(`KB articles root must not be a symbolic link: ${articlesRoot}`);
    }
    if (!articlesRootStats.isDirectory()) {
      throw new Error(`KB articles root must be a directory: ${articlesRoot}`);
    }

    const realArticlesRoot = realpathSync(articlesRoot);
    const target = resolve(realArticlesRoot, articlePath);
    const pathFromRoot = relative(realArticlesRoot, target);
    if (
      pathFromRoot === '' ||
      pathFromRoot === '..' ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      throw new Error(`KB article path escapes articles directory: ${articlePath}`);
    }
    if (lstatSync(target).isSymbolicLink()) {
      throw new Error(`KB article must not be a symbolic link: ${articlePath}`);
    }

    const realTarget = realpathSync(target);
    if (dirname(realTarget) !== realArticlesRoot || !statSync(realTarget).isFile()) {
      throw new Error(
        `KB article must be a regular file directly under articles directory: ${articlePath}`
      );
    }
    return readFileSync(realTarget, 'utf8');
  };
}

export function getKbCatalog(): KbCatalog {
  if (cachedCatalog) return cachedCatalog;
  const manifest = JSON.parse(readFileSync(join(KB_ROOT, 'manifest.json'), 'utf8')) as KbManifest;
  cachedCatalog = buildKbCatalog(
    manifest,
    (sourcePath) => readFileSync(join(KB_ROOT, 'source', sourcePath), 'utf8'),
    new Date(),
    createKbArticleReader(KB_ARTICLES_ROOT)
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
