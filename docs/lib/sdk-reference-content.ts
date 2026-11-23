import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';
import { attributeValue, parseExampleDocument } from './example-document';
import {
  languages,
  pageNames,
  snapshotDirectory,
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
  visit(parseExampleDocument(source, 'page.mdx'), ['mdxJsxFlowElement', 'mdxJsxTextElement'], node => {
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

function renderVersion(source: string, language: Language, snapshot: Snapshot): string {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source)?.[0];
  if (!frontmatter) throw new Error('SDK reference page must start with frontmatter');
  const { command, packageName, separator } = installations[language];
  const install = `${command} ${packageName}${separator}${snapshot.version}`;
  const body = pinInstallWidgets(source.slice(frontmatter.length).trimStart(), language, snapshot.version);
  return `${frontmatter}\n> SDK version \`${snapshot.version}\`. Install with \`${install}\`.\n\n${body}`;
}

/** Assemble one Fumadocs reference collection for all public output formats. */
export function prepareStableReference(docsRoot: string, destination: string): void {
  if (readdirSync(destination).length !== 0) {
    throw new Error(`Stable reference destination must be empty: ${destination}`);
  }
  const workspace = join(docsRoot, 'content/reference');
  const plans = languages.map(language => {
    const directory = snapshotDirectory(docsRoot, language);
    return { language, directory, snapshot: verifySnapshot(directory) };
  });
  const workspaceSdk = join(workspace, 'sdk-reference');
  cpSync(workspace, destination, {
    recursive: true,
    filter: path => !languages.some(language => path === join(workspaceSdk, language)),
  });
  for (const { language, directory, snapshot } of plans) {
    const target = join(destination, 'sdk-reference', language);
    mkdirSync(target, { recursive: true });
    const pages = join(directory, 'pages');
    for (const name of pageNames(pages)) {
      const source = join(pages, name);
      if (name.endsWith('.mdx')) {
        writeFileSync(join(target, name), renderVersion(readFileSync(source, 'utf8'), language, snapshot));
      } else {
        cpSync(source, join(target, name));
      }
    }
  }
}
