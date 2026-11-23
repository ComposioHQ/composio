import { expect, test } from 'bun:test';
import { getAlgoliaSearchDocuments } from '../../lib/search-index';
import { readSnapshot, snapshotDirectory } from '../../lib/sdk-reference-snapshot';

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
