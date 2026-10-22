import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FileObject } from 'next-validate-link';
import { validateSdkMarkdownLinks } from '../../scripts/validate-sdk-doc-links';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (!temporaryDirectory) return;
  await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

async function fixtureFiles(sourceContent: string): Promise<FileObject[]> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'sdk-doc-links-'));
  const sourcePath = join(temporaryDirectory, 'api', 'composio.md');
  const targetPath = join(temporaryDirectory, 'advanced', 'guide.md');
  await mkdir(join(temporaryDirectory, 'api'), { recursive: true });
  await mkdir(join(temporaryDirectory, 'advanced'), { recursive: true });
  await writeFile(sourcePath, sourceContent);
  await writeFile(
    targetPath,
    '## Security: **sensitive** `local` paths\n\n~~~md\n## Heading in example\n~~~\n'
  );

  return Promise.all(
    [sourcePath, targetPath].map(async (path, index) => ({
      path: resolve(path),
      content: await readFile(path, 'utf-8'),
      url: index === 0 ? '/sdk-docs/api/composio.md' : '/sdk-docs/advanced/guide.md',
    }))
  );
}

describe('SDK documentation links', () => {
  test('accepts an existing relative Markdown target and heading anchor', async () => {
    const files = await fixtureFiles(
      '[Guide](../advanced/guide.md#security-sensitive-local-paths)\n'
    );

    expect(await validateSdkMarkdownLinks(files)).toEqual([]);
  });

  test('rejects missing Markdown targets and missing heading anchors', async () => {
    const files = await fixtureFiles(
      [
        '[Missing file](./advanced/guide.md#security-sensitive-local-paths)',
        '[Missing heading](../advanced/guide.md#not-a-real-heading)',
        '[Heading in example](../advanced/guide.md#heading-in-example)',
        '[Missing page heading](#not-a-real-heading)',
        '![Missing image](../assets/example.png)',
      ].join('\n')
    );

    const errors = await validateSdkMarkdownLinks(files);

    expect(errors.flatMap(result => result.errors.map(error => error.url)).sort()).toEqual(
      [
        './advanced/guide.md#security-sensitive-local-paths',
        '../advanced/guide.md#not-a-real-heading',
        '../advanced/guide.md#heading-in-example',
        '#not-a-real-heading',
        '../assets/example.png',
      ].sort()
    );
  });

  test('checks anchors in linked Markdown files outside the SDK docs folder', async () => {
    const files = await fixtureFiles('[Provider](../packages/provider.md#missing-heading)\n');
    const targetPath = join(temporaryDirectory!, 'packages', 'provider.md');
    await mkdir(join(temporaryDirectory!, 'packages'), { recursive: true });
    await writeFile(targetPath, '## Provider setup\n');

    const errors = await validateSdkMarkdownLinks(files);

    expect(errors.flatMap(result => result.errors.map(error => error.url))).toEqual([
      '../packages/provider.md#missing-heading',
    ]);
  });
});
