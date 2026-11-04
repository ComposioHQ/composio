import { describe, expect, test } from 'bun:test';
import { isSdkChangelog } from '../scripts/sdk-release/changelog-filter';
import {
  checkLiveDocs,
  pinDocsSdkVersions as pinEffect,
  requireFreshDocsInput as freshnessEffect,
  verifyLiveReleaseDocs as verifyLiveEffect,
} from '../scripts/sdk-release/docs';
import { runRelease, type Fetch } from './sdk-release-harness';

const pinDocsSdkVersions = (...args: Parameters<typeof pinEffect>) =>
  runRelease(pinEffect(...args));
const requireFreshDocsInput = (...args: Parameters<typeof freshnessEffect>) =>
  runRelease(freshnessEffect(...args));
const verifyLiveReleaseDocs = (release: Parameters<typeof verifyLiveEffect>[0], fetch: Fetch) =>
  runRelease(verifyLiveEffect(release), fetch);

describe('released SDK documentation', () => {
  test('only the SDK frontmatter marker suppresses ordinary changelog automation', () => {
    expect(
      isSdkChangelog('---\ntitle: Ordinary\ndate: "2026-11-03"\n---\nMention sdkRelease: in prose')
    ).toBe(false);
    expect(isSdkChangelog('---\ntitle: Release\nsdkRelease: "51"\n---\nChanges')).toBe(true);
  });
  test('pins only existing SDK dependencies to exact verified versions without downgrades', async () => {
    const manifest = {
      scripts: { build: 'next build' },
      dependencies: { '@composio/core': '^0.28.0', react: '^19' },
      devDependencies: { '@composio/openai': '0.13.1' },
    };
    expect(
      await pinDocsSdkVersions(manifest, {
        '@composio/core': '0.29.0',
        '@composio/openai': '0.13.2',
        '@composio/google': '0.12.0',
      })
    ).toEqual({
      ...manifest,
      dependencies: { '@composio/core': '0.29.0', react: '^19' },
      devDependencies: { '@composio/openai': '0.13.2' },
    });
    await expect(
      pinDocsSdkVersions(manifest, { '@composio/core': '0.27.0', '@composio/openai': '0.13.2' })
    ).rejects.toThrow('decrease');
  });
  test('an existing range cannot conceal a higher installed SDK version in the Bun lock', async () => {
    const manifest = { dependencies: { '@composio/core': '^0.27.0' } };
    await expect(
      pinDocsSdkVersions(manifest, { '@composio/core': '0.28.0' }, { '@composio/core': '0.29.0' })
    ).rejects.toThrow('decrease');
  });
  test('a delayed request cannot overwrite newer verified targets, protected docs or pending guide edits', async () => {
    const input = { sourceSha: 'a'.repeat(40), verifiedRunId: 51, branchHead: 'b'.repeat(40) };
    await requireFreshDocsInput(input, input);
    for (const latest of [
      { ...input, verifiedRunId: 52 },
      { ...input, sourceSha: 'c'.repeat(40) },
      { ...input, branchHead: 'c'.repeat(40) },
    ]) {
      await expect(requireFreshDocsInput(input, latest)).rejects.toThrow('changed');
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
    const fetcher: Fetch = async input => {
      const url = String(input);
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
  test('a live docs mismatch warns on the request issue and makes no other GitHub write', async () => {
    const release = {
      date: '2026-11-03',
      statusUrl: 'https://github.com/ComposioHQ/composio/issues/51',
      plan: {
        releases: [
          { name: '@composio/core', newVersion: '0.29.0', language: 'typescript' as const },
        ],
      },
    };
    const writes: { method: string; url: string; body: unknown }[] = [];
    const fetcher: Fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://api.github.com/')) {
        writes.push({
          method: init?.method ?? 'GET',
          url,
          body: JSON.parse(String(init?.body ?? 'null')),
        });
        return Response.json({ id: 1 });
      }
      return new Response('<article>Old docs</article>');
    };
    await expect(
      runRelease(
        checkLiveDocs(release, 'https://github.com/ComposioHQ/composio/actions/runs/77', {
          times: 0,
        }),
        fetcher
      )
    ).rejects.toThrow('release targets');
    expect(writes).toEqual([
      {
        method: 'POST',
        url: 'https://api.github.com/repos/ComposioHQ/composio/issues/51/comments',
        body: { body: expect.stringContaining('live docs check failed') },
      },
    ]);
    expect(String((writes[0].body as { body: string }).body)).toContain('actions/runs/77');
  });
});
