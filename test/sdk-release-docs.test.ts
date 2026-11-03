import { describe, expect, test } from 'bun:test';
import {
  isSdkChangelog,
  pinDocsSdkVersions,
  requireFreshDocsInput,
  verifyLiveReleaseDocs,
} from '../scripts/sdk-release/docs';

describe('released SDK documentation', () => {
  test('only the SDK frontmatter marker suppresses ordinary changelog automation', () => {
    expect(
      isSdkChangelog('---\ntitle: Ordinary\ndate: "2026-11-03"\n---\nMention sdkRelease: in prose')
    ).toBe(false);
    expect(isSdkChangelog('---\ntitle: Release\nsdkRelease: "51"\n---\nChanges')).toBe(true);
  });
  test('pins only existing SDK dependencies to exact verified versions without downgrades', () => {
    const manifest = {
      scripts: { build: 'next build' },
      dependencies: { '@composio/core': '^0.28.0', react: '^19' },
      devDependencies: { '@composio/openai': '0.13.1' },
    };
    expect(
      pinDocsSdkVersions(manifest, {
        '@composio/core': '0.29.0',
        '@composio/openai': '0.13.2',
        '@composio/google': '0.12.0',
      })
    ).toEqual({
      ...manifest,
      dependencies: { '@composio/core': '0.29.0', react: '^19' },
      devDependencies: { '@composio/openai': '0.13.2' },
    });
    expect(() =>
      pinDocsSdkVersions(manifest, { '@composio/core': '0.27.0', '@composio/openai': '0.13.2' })
    ).toThrow('decrease');
  });
  test('an existing range cannot conceal a higher installed SDK version in the Bun lock', () => {
    const manifest = { dependencies: { '@composio/core': '^0.27.0' } };
    expect(() =>
      pinDocsSdkVersions(manifest, { '@composio/core': '0.28.0' }, { '@composio/core': '0.29.0' })
    ).toThrow('decrease');
  });
  test('a delayed request cannot overwrite newer verified targets, protected docs or pending guide edits', () => {
    const input = { sourceSha: 'a'.repeat(40), verifiedRunId: 51, branchHead: 'b'.repeat(40) };
    expect(() => requireFreshDocsInput(input, input)).not.toThrow();
    for (const latest of [
      { ...input, verifiedRunId: 52 },
      { ...input, sourceSha: 'c'.repeat(40) },
      { ...input, branchHead: 'c'.repeat(40) },
    ]) {
      expect(() => requireFreshDocsInput(input, latest)).toThrow('changed');
    }
  });
  test('completion needs the status link and package/version rows in HTML and Markdown, plus live references', async () => {
    const release = {
      date: '2026-11-03',
      statusUrl: 'https://github.com/ComposioHQ/composio/issues/51',
      plan: {
        releases: [
          { name: '@composio/core', newVersion: '0.29.0', language: 'typescript' as const },
        ],
      },
    };
    const requests: string[] = [];
    const fetcher = async (url: string) => {
      requests.push(url);
      return new Response(
        url.endsWith('/tools')
          ? '<article>Tools SDK reference</article>'
          : url.endsWith('.md')
            ? `[status](${release.statusUrl})\n| TypeScript \`@composio/core\` | \`0.29.0\` |`
            : `<a href="${release.statusUrl}">status</a><table><tr><td>TypeScript <code>@composio/core</code></td><td><code>0.29.0</code></td></tr></table>`
      );
    };
    await verifyLiveReleaseDocs(release, fetcher);
    expect(requests).toContain('https://docs.composio.dev/docs/changelog/2026/11/03.md');
    expect(requests).toContain(
      'https://docs.composio.dev/reference/sdk-reference/typescript/tools'
    );
    await expect(
      verifyLiveReleaseDocs(release, async () => new Response('<article>Old docs</article>'))
    ).rejects.toThrow('release targets');
    await expect(
      verifyLiveReleaseDocs(
        {
          ...release,
          plan: {
            releases: [{ name: '@composio/python-sdk', newVersion: '0.29.0', language: 'python' }],
          },
        },
        fetcher
      )
    ).rejects.toThrow('release targets');
  });
});
