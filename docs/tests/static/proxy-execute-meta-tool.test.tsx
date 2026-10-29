import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { GET } from '../../app/llms.mdx/[[...slug]]/route';
import { MetaToolDetail } from '../../components/meta-tools/meta-tool-detail';
import { getMetaToolBySlug } from '../../lib/meta-tools-data';

describe('proxy execute meta-tool reference', () => {
  test('generation discovers opt-in tools and preserves unrestricted JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'composio-meta-tools-'));
    const transport = join(directory, 'transport.ts');
    await writeFile(transport, `
      let enabled = false;
      globalThis.fetch = async (_url, options) => {
        if (options?.method === 'POST') {
          enabled = JSON.parse(options.body).proxy_execute?.enable === true;
          return Response.json({ session_id: 'test-session', tool_router_tools: [] });
        }
        return Response.json(enabled ? [{
          slug: 'COMPOSIO_PROXY_EXECUTE', name: 'proxy_execute',
          input_parameters: { type: 'object', properties: { body: { description: 'Any JSON' } } },
          output_parameters: { type: 'object', properties: {} },
        }] : []);
      };
    `);

    try {
      const child = Bun.spawn([
        process.execPath, '--preload', transport, resolve('scripts/generate-meta-tools.ts'),
      ], {
        cwd: directory,
        env: { ...process.env, COMPOSIO_API_KEY: 'test-key', COMPOSIO_API_BASE: '' },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
      ]);
      expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      expect(await readFile(join(directory, 'content/toolkits/meta-tools/index.mdx'), 'utf8'))
        .toContain('/toolkits/meta-tools/proxy_execute');
      expect(await readFile(join(directory, 'content/toolkits/meta-tools/proxy_execute.mdx'), 'utf8'))
        .toContain('<MetaToolDetailServer slug="COMPOSIO_PROXY_EXECUTE" />');
      const tools = await Bun.file(join(directory, 'public/data/meta-tools.json')).json();
      expect(tools[0].inputParameters.properties.body).toEqual({ description: 'Any JSON' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('HTML labels unrestricted request bodies as any', async () => {
    const tool = await getMetaToolBySlug('COMPOSIO_PROXY_EXECUTE');
    expect(tool).not.toBeNull();
    const html = renderToStaticMarkup(<MetaToolDetail tool={tool!} />);
    expect(html).toMatch(/>body<\/code><span[^>]*>any<\/span>/);
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
    expect(markdown).not.toContain('(undefined)');
    expect(markdown).toContain('`successful: false`');
    expect(markdown).toContain('non-2xx');
    expect(markdown).toContain('`type` instead of `in`');
  });
});
