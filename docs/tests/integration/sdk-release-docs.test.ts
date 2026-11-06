import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { remarkLLMs } from 'fumadocs-core/mdx-plugins/remark-llms';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import type {
  ReleaseDocumentationPlan,
  ReleaseNoteOptions,
} from '../../scripts/generate-sdk-release-notes';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures: string[] = [];

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'composio-release-docs-'));
  fixtures.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});

const plan: ReleaseDocumentationPlan = {
  releases: [
    { name: '@composio/core', language: 'typescript', newVersion: '0.28.0' },
    { name: '@composio/python-sdk', language: 'python', newVersion: '0.30.1' },
  ],
  changesets: [{ summary: 'Keep reviewed migration guidance.' }],
};
const options = {
  releaseId: 'request-42',
  date: '2026-11-03',
  requestUrl: 'https://github.com/ComposioHQ/composio/issues/42',
};

test('historical release code renders with old docs SDK pins while maintained guide code fails', async () => {
  const directory = await fixture();
  await symlink(join(docsRoot, 'node_modules'), join(directory, 'node_modules'), 'dir');
  await mkdir(join(directory, 'changelog'));
  await mkdir(join(directory, 'guides'));
  const content = `---\ntitle: Release fixture\ndate: '2026-11-03'\n---\n\nSee the [release request](${options.requestUrl}).\n\n\`\`\`typescript\nimport { Composio } from '@composio/core';\nconst composio = new Composio({ apiKey: 'fixture' });\ncomposio.unpublishedReleaseFixture();\n\`\`\`\n\n\`\`\`mermaid\ngraph TD\n A --> B\n\`\`\`\n`;
  const historical = join(directory, 'changelog/release.mdx');
  const guide = join(directory, 'guides/current.mdx');
  await writeFile(historical, content);
  await writeFile(guide, content);
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env.NODE_ENV;
  process.chdir(directory);
  process.env.NODE_ENV = 'production';
  try {
    const source: typeof import('../../source.config') = await import(
      `${pathToFileURL(join(docsRoot, 'source.config.ts')).href}?release-docs=${Date.now()}`
    );
    const compileCollection = async (path: string, historical: boolean) => {
      const collection = historical ? source.changelog : source.docs.docs;
      const global = source.default.mdxOptions;
      const globalOptions = typeof global === 'function' ? await global() : global;
      const configured = collection.mdxOptions ?? applyMdxPreset(globalOptions);
      const mdxOptions =
        typeof configured === 'function' ? await configured('bundler') : configured;
      const matter = frontmatter(await readFile(path, 'utf8'));
      const file = await compile(
        { value: matter.content, path },
        {
          ...mdxOptions,
          outputFormat: 'function-body',
          development: false,
          remarkPlugins: [
            ...(mdxOptions.remarkPlugins ?? []),
            ...(collection.postprocess?.includeProcessedMarkdown ? [remarkLLMs] : []),
          ],
        }
      );
      return run(String(file), { ...runtime, baseUrl: pathToFileURL(path) });
    };
    const compiled = await compileCollection(historical, true);
    const html = renderToStaticMarkup(
      createElement(compiled.default, {
        components: {
          Mermaid: ({ chart }: { chart: string }) => createElement('pre', null, chart),
        },
      })
    );
    expect(html).toContain(`href="${options.requestUrl}"`);
    expect(html).toContain('unpublishedReleaseFixture');
    expect(html).toContain('graph TD');
    expect(compiled._markdown).toContain(`[release request](${options.requestUrl})`);
    expect(compiled._markdown).toContain('unpublishedReleaseFixture');
    await expect(compileCollection(guide, false)).rejects.toThrow('unpublishedReleaseFixture');
  } finally {
    process.chdir(previousDirectory);
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
}, 30000);

const generateSdkReleaseNotes = async (
  directory: string,
  value: ReleaseDocumentationPlan,
  input: ReleaseNoteOptions
) => {
  const notes = await import('../../scripts/generate-sdk-release-notes');
  return Effect.runPromise(
    notes.generateSdkReleaseNotes(directory, value, input).pipe(Effect.provide(BunServices.layer))
  );
};

test('release notes record the planned versions and changeset summaries once', async () => {
  const directory = await fixture();
  const contents = await readFile(
    join(directory, await generateSdkReleaseNotes(directory, plan, options)),
    'utf8'
  );
  expect(contents).toContain('sdkRelease: "request-42"');
  expect(contents).toContain('| Python `composio` | `0.30.1` |');
  expect(contents).toContain('| TypeScript `@composio/core` | `0.28.0` |');
  expect(contents).toContain(`[release request](${options.requestUrl})`);
  expect(contents.match(/Keep reviewed migration guidance\./g)).toHaveLength(1);
});

test('no-op plans create no changelog', async () => {
  const directory = await fixture();
  await expect(
    generateSdkReleaseNotes(directory, { ...plan, releases: [], changesets: [] }, options)
  ).rejects.toThrow('Nothing to document');
  expect(
    await Bun.file(join(directory, 'docs/content/changelog/11-03-26-sdk-request-42.mdx')).exists()
  ).toBe(false);
});

test('changeset summaries render as literal Markdown, never as MDX code', async () => {
  const { literalMdx } = await import('../../scripts/generate-sdk-release-notes');
  const summary = [
    'import fs from "node:fs"',
    'Adds {globalThis.injected = true} and <script>alert(1)</script>.',
    'Escaped \\`{globalThis.injected = true}` and mismatched `{globalThis.injected = true}`` runs.',
    'Keep `{inline}` and:',
    '```ts\nconst value = { a: 1 };\n```',
  ].join('\n\n');
  const file = await compile(literalMdx(summary), {
    outputFormat: 'function-body',
    development: false,
  });
  const compiled = await run(String(file), { ...runtime, baseUrl: import.meta.url });
  const html = renderToStaticMarkup(createElement(compiled.default));
  expect((globalThis as { injected?: boolean }).injected).toBeUndefined();
  expect(html).toContain('import fs from');
  expect(html).toContain('{globalThis.injected = true}');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('<code>{inline}</code>');
  expect(html).toContain('const value = { a: 1 };');
});
