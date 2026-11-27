import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { GET } from '../../app/llms.mdx/[[...slug]]/route';
import { MetaToolDetail } from '../../components/meta-tools/meta-tool-detail';
import { getMetaToolBySlug } from '../../lib/meta-tools-data';

describe('proxy execute meta-tool reference', () => {
  const exportUrl = 'https://backend.composio.dev/meta-tools.json';
  const tool = {
    slug: 'COMPOSIO_PROXY_EXECUTE',
    name: 'proxy_execute',
    displayName: 'Proxy Execute',
    description: 'Read from the snapshot',
    tags: [],
    toolkit: null,
    inputParameters: { type: 'object', properties: { body: { description: 'Any JSON' } } },
    responseSchema: { type: 'object', properties: {} },
  };

  test.each([
    ['checked-in snapshot', ''],
    ['read-only export', exportUrl],
    ['invalid export', `${exportUrl}?empty`],
  ])('generation handles the %s', async (_name, source) => {
    const directory = await mkdtemp(join(tmpdir(), 'composio-meta-tools-'));
    const transport = join(directory, 'transport.ts');
    const snapshotPath = join(directory, 'public/data/meta-tools.json');
    const snapshot = JSON.stringify([tool]);
    const exportedTool = { ...tool, description: 'Read from the export' };
    const invalidExport = source.endsWith('?empty');

    try {
      await mkdir(join(directory, 'public/data'), { recursive: true });
      await writeFile(snapshotPath, snapshot);
      await writeFile(transport, `
        globalThis.fetch = async (input, init) => {
          const request = new Request(input, init);
          const source = process.env.COMPOSIO_META_TOOLS_SCHEMA_URL;
          if (!source || request.url !== source || request.method !== 'GET' ||
              request.headers.has('x-api-key') || request.headers.has('authorization')) {
            throw new Error('Unexpected request from the meta-tool generator');
          }
          return Response.json(${JSON.stringify(invalidExport ? [] : [exportedTool])});
        };
      `);
      const child = Bun.spawn([
        process.execPath, '--preload', transport, resolve('scripts/generate-meta-tools.ts'),
      ], {
        cwd: directory,
        env: {
          ...process.env,
          COMPOSIO_API_KEY: source ? 'test-key' : '',
          COMPOSIO_META_TOOLS_SCHEMA_URL: source,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
      ]);
      if (invalidExport) {
        expect(exitCode).toBe(1);
        expect(stderr).toContain('ZodError');
        expect(await readFile(snapshotPath, 'utf8')).toBe(snapshot);
        return;
      }

      expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      expect(await readFile(join(directory, 'content/toolkits/meta-tools/index.mdx'), 'utf8'))
        .toContain('/toolkits/meta-tools/proxy_execute');
      expect(await readFile(join(directory, 'content/toolkits/meta-tools/proxy_execute.mdx'), 'utf8'))
        .toContain('<MetaToolDetailServer slug="COMPOSIO_PROXY_EXECUTE" />');
      const saved = await readFile(snapshotPath, 'utf8');
      if (source) {
        expect(JSON.parse(saved)).toEqual([exportedTool]);
      } else {
        expect(saved).toBe(snapshot);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('HTML labels unrestricted request bodies as any', async () => {
    const tool = await getMetaToolBySlug('COMPOSIO_PROXY_EXECUTE');
    expect(tool).not.toBeNull();
    const html = renderToStaticMarkup(<MetaToolDetail tool={tool!} />);
    expect(html).toMatch(/>body<\/code><span[^>]*>any<\/span>/);
    expect(html).toMatch(/>parameters<\/code><span[^>]*>array&lt;object&gt;<\/span>/);
    expect(html).toContain('HEAD');
  });

  test('Markdown includes usage semantics and unrestricted nested response bodies', async () => {
    const response = await GET(
      new Request('https://docs.composio.dev/toolkits/meta-tools/proxy_execute.md'),
      { params: Promise.resolve({ slug: ['toolkits', 'meta-tools', 'proxy_execute'] }) },
    );
    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain('`body` (any)');
    expect(markdown).toContain('`data` (any)');
    expect(markdown).toContain('`parameters` (array<object>)');
    expect(markdown).not.toContain('(undefined)');
    expect(markdown).toContain('`successful: false`');
    expect(markdown).toContain('non-2xx');
    expect(markdown).toContain('`type` instead of `in`');
  });
});
