import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { visit } from 'unist-util-visit';
import { attributeValue, parseExampleDocument } from './example-document';
import {
  languages,
  pageNames,
  readSnapshot,
  readSnapshotPages,
  snapshotDirectory,
  stableReferenceRoot,
  verifySnapshot,
  type Language,
  type Snapshot,
  type StablePage,
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

const BANNER = /^> SDK version `[^`]+`\. Install with `[^`]+`\.\n\n/;

const sourceLinkPrefix = '](https://github.com/composiohq/composio/blob/next/';

/** The one line every frozen page carries, naming the version it documents. */
export function versionBanner(language: Language, version: string): string {
  const { command, packageName, separator } = installations[language];
  return `> SDK version \`${version}\`. Install with \`${command} ${packageName}${separator}${version}\`.`;
}

interface Widget {
  ecosystem: string;
  packages: string;
  start: number;
  end: number;
}

/** Locate every install widget, so pinning and its check read the same nodes. */
function installWidgets(source: string): Widget[] {
  const widgets: Widget[] = [];
  visit(parseExampleDocument(source, 'page.mdx'), ['mdxJsxFlowElement', 'mdxJsxTextElement'] as const, node => {
    if (node.name !== 'PackageInstall') return;
    const packages = attributeValue(node, 'packages');
    if (packages === undefined) return;
    const attribute = node.attributes.find(item => item.type === 'mdxJsxAttribute' && item.name === 'packages');
    const start = attribute?.position?.start.offset;
    const end = attribute?.position?.end.offset;
    if (start === undefined || end === undefined) return;
    // An array value needs JSX expression rewriting rather than a literal swap.
    // Fail loudly instead of freezing a widget that still points at `latest`.
    if (typeof packages !== 'string') {
      throw new Error('PackageInstall packages must be a string literal to freeze a version');
    }
    widgets.push({
      ecosystem: (attributeValue(node, 'ecosystem') as string | undefined) ?? 'node',
      packages,
      start,
      end,
    });
  });
  return widgets;
}

function pinInstallWidgets(source: string, language: Language, version: string): string {
  if (!source.includes('<PackageInstall')) return source;

  const { ecosystem, requirement, separator } = installations[language];
  const changes: { start: number; end: number; packages: string }[] = [];
  for (const widget of installWidgets(source)) {
    if (widget.ecosystem !== ecosystem) continue;
    const pinned = widget.packages.replace(requirement, `$1$2$3${separator}${version}$2`);
    if (pinned !== widget.packages) changes.push({ start: widget.start, end: widget.end, packages: pinned });
  }

  for (const { start, end, packages } of changes.reverse()) {
    const literal = packages.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    source = source.slice(0, start) + `packages="${literal}"` + source.slice(end);
  }
  return source;
}

/** Point "View source" links at the released tree instead of a moving `next`. */
function pinSourceLinks(source: string, sourceCommit: string): string {
  return source.replaceAll(
    sourceLinkPrefix,
    `](https://github.com/composiohq/composio/blob/${sourceCommit}/`
  );
}

/**
 * The committed snapshot is what production serves, so it holds the pins rather
 * than being re-derived on every build. Render idempotently: a re-run replaces
 * the banner instead of stacking a second copy.
 */
export function renderStablePage(
  source: string,
  language: Language,
  snapshot: Pick<Snapshot, 'version' | 'sourceCommit'>
): string {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source)?.[0];
  if (!frontmatter) throw new Error('SDK reference page must start with frontmatter');
  const body = source.slice(frontmatter.length).trimStart().replace(BANNER, '');
  const pinned = pinSourceLinks(pinInstallWidgets(body, language, snapshot.version), snapshot.sourceCommit);
  return `${frontmatter}\n${versionBanner(language, snapshot.version)}\n\n${pinned}`;
}

/** Every property the frozen copy must hold once it is committed. */
export function assertFrozenPage(
  source: string,
  language: Language,
  snapshot: Pick<Snapshot, 'version' | 'sourceCommit'>
): void {
  const banner = versionBanner(language, snapshot.version);
  const name = `${language} SDK reference ${snapshot.version}`;
  if (!source.includes(banner)) throw new Error(`${name} page is missing its version banner`);
  if (pinInstallWidgets(source, language, snapshot.version) !== source) {
    throw new Error(`${name} page still has an unpinned install command`);
  }
  if (source.includes(sourceLinkPrefix)) throw new Error(`${name} page still links to \`next\``);
}

export function assertFrozenPages(directory: string, language: Language): Snapshot {
  const snapshot = readSnapshot(directory);
  for (const { name, source } of readSnapshotPages(join(directory, 'pages'))) {
    if (name.endsWith('.mdx')) assertFrozenPage(source, language, snapshot);
  }
  return snapshot;
}

/** Page invariants plus the recorded digest, for anything about to be published. */
export function assertFrozenSnapshot(directory: string, language: Language): Snapshot {
  verifySnapshot(directory);
  return assertFrozenPages(directory, language);
}

/** Render the generated workspace pages into the bytes the frozen copy stores. */
export function renderSnapshotPages(
  sourceDirectory: string,
  language: Language,
  snapshot: Pick<Snapshot, 'version' | 'sourceCommit'>
): StablePage[] {
  return pageNames(sourceDirectory).map(name => {
    const source = readFileSync(join(sourceDirectory, name), 'utf8');
    if (!name.endsWith('.mdx')) return { name, source };
    const rendered = renderStablePage(source, language, snapshot);
    assertFrozenPage(rendered, language, snapshot);
    return { name, source: rendered };
  });
}

/** Assemble one Fumadocs reference collection for all public output formats. */
export function prepareStableReference(docsRoot: string, destination: string): void {
  if (basename(destination) !== basename(stableReferenceRoot(docsRoot))) {
    throw new Error(`Invalid stable reference destination: ${destination}`);
  }
  for (const language of languages) assertFrozenSnapshot(snapshotDirectory(docsRoot, language), language);

  const workspace = join(docsRoot, 'content/reference');
  const workspaceSdk = join(workspace, 'sdk-reference');
  rmSync(destination, { recursive: true, force: true });
  cpSync(workspace, destination, {
    recursive: true,
    filter: path => !languages.some(language => path === join(workspaceSdk, language)),
  });
  for (const language of languages) {
    const target = join(destination, 'sdk-reference', language);
    mkdirSync(target, { recursive: true });
    cpSync(join(snapshotDirectory(docsRoot, language), 'pages'), target, { recursive: true });
  }
}
