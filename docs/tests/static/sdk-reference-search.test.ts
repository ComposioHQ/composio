import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAlgoliaSearchDocuments } from '../../lib/search-index';
import { prepareStableReference, renderSnapshotPages } from '../../lib/sdk-reference-content';
import { languages, promoteSnapshot, readSnapshot, snapshotDirectory, stableReferenceRoot } from '../../lib/sdk-reference-snapshot';

// Search imports the generated Fumadocs collections, so this lives outside the
// dependency-light snapshot suite that the stable reference workflow runs.
test('production search without the assembled collection keeps snapshot version pins', async () => {
  const env = { VERCEL_ENV: process.env.VERCEL_ENV, COMPOSIO_STABLE_REFERENCE_DIR: process.env.COMPOSIO_STABLE_REFERENCE_DIR };
  process.env.VERCEL_ENV = 'production';
  delete process.env.COMPOSIO_STABLE_REFERENCE_DIR;
  try {
    const records = await getAlgoliaSearchDocuments();
    const installs = {
      typescript: { banner: 'npm install @composio/core@', widget: 'pnpm add @composio/core@' },
      python: { banner: 'pip install composio==', widget: 'uv add composio==' },
    } as const;
    for (const [language, { banner, widget }] of Object.entries(installs)) {
      const { version } = readSnapshot(snapshotDirectory(process.cwd(), language as keyof typeof installs));
      const content = records
        .filter(record => record.url === `/reference/sdk-reference/${language}`)
        .map(record => record.content)
        .join('\n');
      expect(content).toContain(`> SDK version \`${version}\`. Install with \`${banner}${version}\`.`);
      expect(content).toContain(`${widget}${version}\n`);
    }
  } finally {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('search indexes assembled reference pages at their canonical URLs', async () => {
  const cwd = process.cwd();
  const env = { VERCEL_ENV: process.env.VERCEL_ENV, COMPOSIO_STABLE_REFERENCE_DIR: process.env.COMPOSIO_STABLE_REFERENCE_DIR };
  const root = mkdtempSync(join(tmpdir(), 'sdk-reference-search-'));
  try {
    const installs = {
      typescript: { version: '0.31.0', banner: 'npm install @composio/core@', widget: 'pnpm add @composio/core@', mdx: '<PackageInstall packages="@composio/core" />' },
      python: { version: '0.34.0', banner: 'pip install composio==', widget: 'uv add composio==', mdx: '<PackageInstall ecosystem="python" packages="composio" />' },
    };
    const sourceCommit = '1'.repeat(40);
    const unreleased = '---\ntitle: Unreleased SDK\n---\n\nUnreleased workspace content\n';
    for (const language of languages) {
      // The workspace keeps a page that has not been released; the snapshot must not.
      const workspace = join(root, 'content/reference/sdk-reference', language);
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(workspace, 'unreleased.mdx'), unreleased);

      const staging = mkdtempSync(join(root, `staging-${language}-`));
      writeFileSync(join(staging, 'meta.json'), '{"pages":["tools"]}');
      writeFileSync(join(staging, 'index.mdx'), '---\ntitle: SDK\n---\n\nStable SDK\n');
      writeFileSync(join(staging, 'tools.mdx'), `---\ntitle: Tools\n---\n\n${installs[language].mdx}\n`);
      const { version } = installs[language];
      promoteSnapshot(
        snapshotDirectory(root, language),
        renderSnapshotPages(staging, language, { version, sourceCommit }),
        version,
        sourceCommit
      );
    }

    const assembled = stableReferenceRoot(root);
    prepareStableReference(root, assembled);
    process.chdir(root);
    delete process.env.VERCEL_ENV;
    process.env.COMPOSIO_STABLE_REFERENCE_DIR = assembled;

    const records = (await getAlgoliaSearchDocuments()).filter(record => record.type === 'reference');
    const urls = languages.map(language => `/reference/sdk-reference/${language}`);
    expect(new Set(records.map(record => record.url))).toEqual(
      new Set(urls.flatMap(url => [url, `${url}/tools`]))
    );
    for (const record of records) {
      expect(record.objectID.startsWith(`${record.url}__`)).toBe(true);
      expect(record.content).not.toContain('Unreleased workspace content');
    }
    for (const language of languages) {
      const { version, banner, widget } = installs[language];
      const content = records
        .filter(record => record.url === `/reference/sdk-reference/${language}/tools`)
        .map(record => record.content)
        .join('\n');
      expect(content).toContain(`> SDK version \`${version}\`. Install with \`${banner}${version}\`.`);
      expect(content).toContain(`${widget}${version}\n`);
    }
  } finally {
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});
