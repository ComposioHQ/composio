import { glob, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type FileObject,
  type ValidateError,
  type ValidateResult,
  printErrors,
  validateFiles,
} from 'next-validate-link';
import GithubSlugger from 'github-slugger';
import { toString } from 'mdast-util-to-string';
import { remark } from 'remark';
import { visit } from 'unist-util-visit';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sdkDocsRoot = resolve(repositoryRoot, 'ts/docs');

interface MarkdownMetadata {
  hashes: string[];
  links: Array<{ href: string; line: number; column: number }>;
  fragmentLinks: Array<{ href: string; line: number; column: number }>;
}

function inspectMarkdown(content: string): MarkdownMetadata {
  const slugger = new GithubSlugger();
  const tree = remark().parse(content);
  const metadata: MarkdownMetadata = { hashes: [], links: [], fragmentLinks: [] };

  visit(tree, node => {
    if (node.type === 'heading') metadata.hashes.push(slugger.slug(toString(node)));
    if (node.type !== 'link' && node.type !== 'image') return;

    const link = {
      href: node.url,
      line: node.position?.start.line ?? 1,
      column: node.position?.start.column ?? 1,
    };
    metadata.links.push(link);
    if (node.type !== 'link' || !node.url.startsWith('#')) return;

    metadata.fragmentLinks.push(link);
  });

  return metadata;
}

async function getLinkedMarkdownTargets(files: FileObject[]): Promise<FileObject[]> {
  const knownPaths = new Set(files.map(file => resolve(file.path)));
  const targets = new Map<string, FileObject>();

  for (const file of files) {
    for (const link of inspectMarkdown(file.content).links) {
      const pathname = link.href.match(/^[^?#]*/)?.[0] ?? '';
      if (
        !pathname.endsWith('.md') ||
        pathname.startsWith('/') ||
        /^[a-z][a-z\d+.-]*:/i.test(pathname)
      ) {
        continue;
      }

      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(pathname);
      } catch {
        continue;
      }

      const targetPath = resolve(dirname(file.path), decodedPath);
      if (knownPaths.has(targetPath) || targets.has(targetPath)) continue;

      try {
        const content = await readFile(targetPath, 'utf-8');
        const relativePath = relative(repositoryRoot, targetPath).split(sep).join('/');
        targets.set(targetPath, {
          path: targetPath,
          content,
          url: `/sdk-docs-target/${relativePath}`,
        });
      } catch {
        // Missing files are reported by validateFiles with source line numbers.
      }
    }
  }

  return [...targets.values()];
}

async function findMissingRelativeFiles(
  files: FileObject[],
  metadataByPath: Map<string, MarkdownMetadata>
): Promise<ValidateResult[]> {
  const results: ValidateResult[] = [];

  for (const file of files) {
    const errors: ValidateError[] = [];
    for (const link of metadataByPath.get(resolve(file.path))?.links ?? []) {
      const pathname = link.href.match(/^[^?#]*/)?.[0] ?? '';
      if (!pathname || pathname.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(pathname)) continue;

      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(pathname);
      } catch {
        decodedPath = pathname;
      }

      try {
        await stat(resolve(dirname(file.path), decodedPath));
      } catch {
        errors.push({
          url: link.href,
          line: link.line,
          column: link.column,
          reason: 'not-found',
        });
      }
    }

    if (errors.length > 0) {
      results.push({
        file: file.path,
        errors,
        detected: errors.map(error => [error.url, error.line, error.column, error.reason]),
      });
    }
  }

  return results;
}

function findInvalidPageFragments(
  files: FileObject[],
  metadataByPath: Map<string, MarkdownMetadata>
): ValidateResult[] {
  const results: ValidateResult[] = [];

  for (const file of files) {
    const metadata = metadataByPath.get(resolve(file.path));
    const hashes = new Set(metadata?.hashes ?? []);
    const errors: ValidateError[] = [];

    for (const link of metadata?.fragmentLinks ?? []) {
      let hash: string;
      try {
        hash = decodeURIComponent(link.href.slice(1));
      } catch {
        hash = link.href.slice(1);
      }
      if (hashes.has(hash)) continue;

      errors.push({
        url: link.href,
        line: link.line,
        column: link.column,
        reason: 'invalid-fragment',
      });
    }

    if (errors.length > 0) {
      results.push({
        file: file.path,
        errors,
        detected: errors.map(error => [error.url, error.line, error.column, error.reason]),
      });
    }
  }

  return results;
}

export async function validateSdkMarkdownLinks(files: FileObject[]): Promise<ValidateResult[]> {
  const linkedTargets = await getLinkedMarkdownTargets(files);
  const allFiles = [...files, ...linkedTargets];
  const urlsByPath = new Map<string, string>();
  const urls = new Map<string, { hashes: string[] }>();
  const metadataByPath = new Map<string, MarkdownMetadata>();

  for (const file of allFiles) {
    const filePath = resolve(file.path);
    if (!file.url) throw new Error(`Missing URL for SDK documentation file: ${file.path}`);
    const metadata = inspectMarkdown(file.content);
    urlsByPath.set(filePath, file.url);
    urls.set(file.url, { hashes: metadata.hashes });
    metadataByPath.set(filePath, metadata);
  }

  const scanned = { urls, fallbackUrls: [] };
  const pathToUrl = (filePath: string) => {
    let decodedPath = filePath;
    try {
      decodedPath = decodeURIComponent(filePath);
    } catch {
      // Keep malformed encodings as-is; the path check will report them.
    }
    return urlsByPath.get(resolve(decodedPath));
  };
  const determinatePathname = (pathname: string) =>
    pathname.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(pathname) ? 'url' : 'relative-file-path';
  const [missingFiles, invalidAnchors] = await Promise.all([
    findMissingRelativeFiles(files, metadataByPath),
    validateFiles(files, {
      scanned,
      pathToUrl,
      checkRelativePaths: 'as-url',
      checkRelativeUrls: false,
      determinatePathname,
    }),
  ]);

  const resultsByFile = new Map<string, ValidateResult>();
  const results = [
    ...missingFiles,
    ...invalidAnchors,
    ...findInvalidPageFragments(files, metadataByPath),
  ];
  for (const result of results) {
    const existing = resultsByFile.get(result.file);
    if (existing) existing.errors.push(...result.errors);
    else resultsByFile.set(result.file, result);
  }

  return [...resultsByFile.values()];
}

async function checkSdkDocLinks() {
  const paths = await Array.fromAsync(glob('**/*.md', { cwd: sdkDocsRoot }));
  const files: FileObject[] = await Promise.all(
    paths.map(async path => {
      const filePath = resolve(sdkDocsRoot, path);
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(sdkDocsRoot, filePath).split(sep).join('/');

      return {
        path: filePath,
        content,
        url: `/sdk-docs/${relativePath}`,
      };
    })
  );

  printErrors(await validateSdkMarkdownLinks(files), true);
}

if (import.meta.main) void checkSdkDocLinks();
