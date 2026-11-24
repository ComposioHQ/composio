import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { visit } from 'unist-util-visit';
import { attributeValue, parseExampleDocument } from './example-document';
import {
  languages,
  pageNames,
  snapshotDirectory,
  stableReferenceRoot,
  verifySnapshot,
  type Language,
  type Snapshot,
} from './sdk-reference-snapshot';

const installations = {
  typescript: {
    ecosystem: 'node',
    command: 'npm install',
    packageName: '@composio/core',
    separator: '@',
    // Preserve surrounding shell quotes if the package was quoted.
    requirement: /(^|\s)(['"]?)(@composio\/core)(?:@[^'"\s]+)?\2(?=\s|$)/g,
  },
  python: {
    ecosystem: 'python',
    command: 'pip install',
    packageName: 'composio',
    separator: '==',
    requirement: /(^|\s)(['"]?)(composio(?:\[[^\]\s]+\])?)(?:[<=>!~][^'"\s]+)?\2(?=\s|$)/gi,
  },
} as const;

function pinInstallWidgets(source: string, language: Language, version: string): string {
  if (!source.includes('<PackageInstall')) return source;

  const { ecosystem, requirement, separator } = installations[language];
  const changes: { start: number; end: number; packages: string }[] = [];
  visit(parseExampleDocument(source, 'page.mdx'), ['mdxJsxFlowElement', 'mdxJsxTextElement'] as const, node => {
    if (node.name !== 'PackageInstall' || (attributeValue(node, 'ecosystem') ?? 'node') !== ecosystem) return;
    const packages = attributeValue(node, 'packages');
    if (typeof packages !== 'string') return;
    const pinned = packages.replace(requirement, `$1$2$3${separator}${version}$2`);
    if (pinned === packages) return;

    const attribute = node.attributes.find(item => item.type === 'mdxJsxAttribute' && item.name === 'packages');
    const start = attribute?.position?.start.offset;
    const end = attribute?.position?.end.offset;
    if (start !== undefined && end !== undefined) changes.push({ start, end, packages: pinned });
  });

  for (const { start, end, packages } of changes.reverse()) {
    const literal = packages.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    source = source.slice(0, start) + `packages="${literal}"` + source.slice(end);
  }
  return source;
}

function pinSourceLinks(source: string, sourceCommit: string): string {
  return source.replaceAll(
    '](https://github.com/composiohq/composio/blob/next/',
    `](https://github.com/composiohq/composio/blob/${sourceCommit}/`
  );
}

function renderVersion(source: string, language: Language, snapshot: Snapshot): string {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source)?.[0];
  if (!frontmatter) throw new Error('SDK reference page must start with frontmatter');
  const { command, packageName, separator } = installations[language];
  const install = `${command} ${packageName}${separator}${snapshot.version}`;
  const body = pinInstallWidgets(source.slice(frontmatter.length).trimStart(), language, snapshot.version);
  return `${frontmatter}\n> SDK version \`${snapshot.version}\`. Install with \`${install}\`.\n\n${pinSourceLinks(body, snapshot.sourceCommit)}`;
}

export interface StableReferencePage {
  name: string;
  source: string;
}

/** Read one verified snapshot's pages as the stable collection publishes them. */
export function renderStableReferencePages(docsRoot: string, language: Language): StableReferencePage[] {
  const directory = snapshotDirectory(docsRoot, language);
  const snapshot = verifySnapshot(directory);
  const pages = join(directory, 'pages');
  return pageNames(pages)
    .filter(name => name.endsWith('.mdx'))
    .map(name => ({ name, source: renderVersion(readFileSync(join(pages, name), 'utf8'), language, snapshot) }));
}

/** Assemble one Fumadocs reference collection for all public output formats. */
export function prepareStableReference(docsRoot: string, destination: string): void {
  if (basename(destination) !== basename(stableReferenceRoot(docsRoot))) {
    throw new Error(`Invalid stable reference destination: ${destination}`);
  }
  const workspace = join(docsRoot, 'content/reference');
  const plans = languages.map(language => ({ language, pages: renderStableReferencePages(docsRoot, language) }));
  const workspaceSdk = join(workspace, 'sdk-reference');
  rmSync(destination, { recursive: true, force: true });
  cpSync(workspace, destination, {
    recursive: true,
    filter: path => !languages.some(language => path === join(workspaceSdk, language)),
  });
  for (const { language, pages } of plans) {
    const target = join(destination, 'sdk-reference', language);
    mkdirSync(target, { recursive: true });
    cpSync(join(snapshotDirectory(docsRoot, language), 'pages/meta.json'), join(target, 'meta.json'));
    for (const { name, source } of pages) writeFileSync(join(target, name), source);
  }
}
