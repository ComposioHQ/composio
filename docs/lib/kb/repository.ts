import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { buildKbCatalog } from './catalog';
import type { KbCatalog, KbGuide, KbGuideDefinition, KbManifest } from './types';

const KB_ROOT = join(process.cwd(), 'kb');
const KB_ARTICLES_ROOT = resolve(KB_ROOT, 'articles');
let cachedCatalog: KbCatalog | null = null;

/**
 * Read the manifest (`kb/manifest.json`: schema version and topics) plus one
 * definition per guide (`kb/guides/<slug>.json`). Guides live in their own files
 * so publication PRs for different guides never touch the same file.
 */
export function readKbManifest(kbRoot = KB_ROOT): KbManifest {
  const base = JSON.parse(readFileSync(join(kbRoot, 'manifest.json'), 'utf8')) as Omit<KbManifest, 'guides'>;
  const guidesRoot = join(kbRoot, 'guides');
  const guides = readdirSync(guidesRoot)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const guide = JSON.parse(readFileSync(join(guidesRoot, name), 'utf8')) as KbGuideDefinition;
      if (`${guide.slug}.json` !== name) throw new Error(`kb/guides/${name} defines ${guide.slug}`);
      return guide;
    });
  return { ...base, guides };
}

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

export function createKbSourceReader(sourceRoot: string): (sourcePath: string) => string {
  return sourcePath => {
    const sourceRootStats = lstatSync(sourceRoot);
    if (sourceRootStats.isSymbolicLink()) {
      throw new Error(`KB source root must not be a symbolic link: ${sourceRoot}`);
    }
    if (!sourceRootStats.isDirectory()) {
      throw new Error(`KB source root must be a directory: ${sourceRoot}`);
    }

    const realSourceRoot = realpathSync(sourceRoot);
    const target = resolve(realSourceRoot, sourcePath);
    const pathFromRoot = relative(realSourceRoot, target);
    if (
      pathFromRoot === '' ||
      pathFromRoot === '..' ||
      pathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromRoot)
    ) {
      throw new Error(`KB source path escapes source directory: ${sourcePath}`);
    }
    if (lstatSync(target).isSymbolicLink()) {
      throw new Error(`KB source must not be a symbolic link: ${sourcePath}`);
    }

    const realTarget = realpathSync(target);
    const realPathFromRoot = relative(realSourceRoot, realTarget);
    if (
      realPathFromRoot === '' ||
      realPathFromRoot === '..' ||
      realPathFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(realPathFromRoot) ||
      !statSync(realTarget).isFile()
    ) {
      throw new Error(`KB source must be a regular file inside source directory: ${sourcePath}`);
    }
    return readFileSync(realTarget, 'utf8');
  };
}

export function getKbCatalog(): KbCatalog {
  if (cachedCatalog) return cachedCatalog;
  const manifest = readKbManifest();
  cachedCatalog = buildKbCatalog(
    manifest,
    createKbSourceReader(resolve(KB_ROOT, 'source')),
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
