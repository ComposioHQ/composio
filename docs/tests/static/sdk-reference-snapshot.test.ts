import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertFrozenPage,
  assertFrozenSnapshot,
  prepareStableReference,
  renderSnapshotPages,
  renderStablePage,
} from '../../lib/sdk-reference-content';
import {
  assertForwardSnapshot,
  pageNames,
  promoteSnapshot,
  resolveStableReferenceSource,
  reviseSnapshot,
  snapshotDirectory,
  stableReferenceRoot,
  verifySnapshot,
  type StablePage,
} from '../../lib/sdk-reference-snapshot';

const RELEASE = '1'.repeat(40);
const NEXT_RELEASE = '2'.repeat(40);
const SOURCE_URL = 'https://github.com/composiohq/composio/blob/next/src/tools.ts#L42';

const widgetFor = (language: 'typescript' | 'python', version = '') =>
  language === 'typescript'
    ? `<PackageInstall packages="@composio/core${version}" />`
    : `<PackageInstall ecosystem="python" packages="composio${version}" />`;
const indexPage = (language: 'typescript' | 'python' = 'typescript', version = '') =>
  `---\ntitle: SDK\n---\n\nInstall:\n\n${widgetFor(language, version)}\n`;
const toolsPage = (body = 'Stable tools') =>
  `---\ntitle: Tools\n---\n\n${body}\n\n[View source](${SOURCE_URL})\n`;

/** Build the generated workspace pages, then render them the way a release does. */
function renderedPages(
  language: 'typescript' | 'python',
  version: string,
  sourceCommit: string
): StablePage[] {
  const workspace = mkdtempSync(join(tmpdir(), 'sdk-reference-workspace-'));
  try {
    writeFileSync(join(workspace, 'meta.json'), '{"pages":["tools"]}');
    writeFileSync(join(workspace, 'index.mdx'), indexPage(language));
    writeFileSync(join(workspace, 'tools.mdx'), toolsPage());
    return renderSnapshotPages(workspace, language, { version, sourceCommit });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function withRenderedPages(verify: (pages: StablePage[]) => void): void {
  verify(renderedPages('typescript', '0.31.0', RELEASE));
}

function withSnapshot(verify: (directory: string, pages: StablePage[]) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'sdk-reference-snapshot-'));
  try {
    withRenderedPages(pages => verify(snapshotDirectory(root, 'typescript'), pages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('rendering freezes the install command, the source link, and the version banner', () => {
  withRenderedPages(pages => {
    const index = pages.find(page => page.name === 'index.mdx')?.source ?? '';
    const tools = pages.find(page => page.name === 'tools.mdx')?.source ?? '';
    expect(index).toContain('> SDK version `0.31.0`. Install with `npm install @composio/core@0.31.0`.');
    expect(index).toContain('<PackageInstall packages="@composio/core@0.31.0" />');
    expect(tools).toContain(`[View source](${SOURCE_URL.replace('/blob/next/', `/blob/${RELEASE}/`)})`);
    expect(tools).not.toContain('/blob/next/');
    // meta.json travels verbatim so the committed snapshot is the served tree.
    expect(pages.find(page => page.name === 'meta.json')?.source).toBe('{"pages":["tools"]}');
  });
});

test('rendering is idempotent, so a rerun replaces the banner instead of stacking it', () => {
  withRenderedPages(pages => {
    const tools = pages.find(page => page.name === 'tools.mdx')?.source ?? '';
    const rerendered = renderStablePage(tools, 'typescript', { version: '0.31.0', sourceCommit: RELEASE });
    expect(rerendered).toBe(tools);
    const bumped = renderStablePage(tools, 'typescript', { version: '0.32.0', sourceCommit: NEXT_RELEASE });
    expect(bumped.match(/> SDK version/g)?.length).toBe(1);
    expect(bumped).toContain('`0.32.0`');
  });
});

test('frozen invariants reject a missing banner, an unpinned command, and a next link', () => {
  const snapshot = { version: '0.31.0', sourceCommit: RELEASE };
  const frozen = renderStablePage(toolsPage(), 'typescript', snapshot);
  expect(() => assertFrozenPage(frozen, 'typescript', snapshot)).not.toThrow();

  const bannerless = frozen.replace(/> SDK version[^\n]*\n\n/, '');
  expect(() => assertFrozenPage(bannerless, 'typescript', snapshot)).toThrow('missing its version banner');

  // Only the widget changes here; the banner legitimately names the same package.
  const frozenIndex = renderStablePage(indexPage(), 'typescript', snapshot);
  const unpinned = frozenIndex.replace('packages="@composio/core@0.31.0"', 'packages="@composio/core"');
  expect(() => assertFrozenPage(unpinned, 'typescript', snapshot)).toThrow('unpinned install command');

  const moving = frozen.replace(`/blob/${RELEASE}/`, '/blob/next/');
  expect(() => assertFrozenPage(moving, 'typescript', snapshot)).toThrow('still links to `next`');
});

test('a promotion records the served bytes and cannot move the revision backwards', () => {
  withSnapshot((directory, pages) => {
    expect(promoteSnapshot(directory, pages, '0.31.0', RELEASE)).toBe('prepared 0.31.0');
    const initial = verifySnapshot(directory);
    expect(assertFrozenSnapshot(directory, 'typescript')).toEqual(initial);
    expect(promoteSnapshot(directory, pages, '0.31.0', RELEASE)).toBe('already current');

    const tools = join(directory, 'pages/tools.mdx');
    writeFileSync(tools, readFileSync(tools, 'utf8').replace('Stable tools', 'Corrected tools'));
    expect(() => verifySnapshot(directory)).toThrow('digest mismatch');
    expect(reviseSnapshot(directory)).toBe(true);
    const corrected = verifySnapshot(directory);
    expect(corrected.revision).toBe(2);
    expect(reviseSnapshot(directory)).toBe(false);
    expect(() => assertForwardSnapshot(initial, corrected)).not.toThrow();
    expect(() => assertForwardSnapshot(corrected, initial)).toThrow('Invalid SDK reference promotion');

    // A corrected revision is final: neither the bot nor an older version may replace it.
    expect(promoteSnapshot(directory, pages, '0.31.0', RELEASE)).toBe('not ahead of 0.31.0 revision 2');
    expect(promoteSnapshot(directory, pages, '0.31.0', NEXT_RELEASE)).toBe('not ahead of 0.31.0 revision 2');
    expect(promoteSnapshot(directory, pages, '0.30.0', RELEASE)).toBe('not ahead of 0.31.0 revision 2');
    expect(verifySnapshot(directory)).toEqual(corrected);

    expect(promoteSnapshot(directory, pages, '0.32.0', NEXT_RELEASE)).toBe('prepared 0.32.0');
    const next = verifySnapshot(directory);
    expect(next.revision).toBe(1);
    expect(() => assertForwardSnapshot(corrected, next)).not.toThrow();
    expect(() => assertForwardSnapshot(next, corrected)).toThrow('Invalid SDK reference promotion');
  });
});

test('a release may repair its own first promotion but never an older version', () => {
  withSnapshot((directory, pages) => {
    promoteSnapshot(directory, pages, '0.31.0', RELEASE);
    const repaired = pages.map(page =>
      page.name === 'tools.mdx' ? { ...page, source: page.source.replace('Stable tools', 'Repaired tools') } : page
    );
    // Same version, same commit, still revision 1: the release machine is allowed
    // to fix output no one has corrected yet.
    expect(promoteSnapshot(directory, repaired, '0.31.0', RELEASE)).toBe('prepared 0.31.0');
    expect(readFileSync(join(directory, 'pages/tools.mdx'), 'utf8')).toContain('Repaired tools');
    expect(verifySnapshot(directory).revision).toBe(1);

    // Once a human has corrected it, the machine stands down.
    writeFileSync(
      join(directory, 'pages/tools.mdx'),
      readFileSync(join(directory, 'pages/tools.mdx'), 'utf8').replace('Repaired tools', 'Hand corrected')
    );
    expect(reviseSnapshot(directory)).toBe(true);
    expect(promoteSnapshot(directory, pages, '0.31.0', RELEASE)).toBe('not ahead of 0.31.0 revision 2');
  });
});

test('the production collection publishes the frozen bytes at the canonical paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-reference-assembled-'));
  try {
    const reference = join(root, 'content/reference');
    const sdk = join(reference, 'sdk-reference');
    mkdirSync(join(sdk, 'typescript'), { recursive: true });
    writeFileSync(join(sdk, 'typescript/unreleased.mdx'), 'Unreleased class');
    writeFileSync(join(sdk, 'meta.json'), '{"pages":["typescript","python"]}');
    writeFileSync(join(reference, 'limits.mdx'), 'Rate limits');

    for (const language of ['typescript', 'python'] as const) {
      const version = language === 'typescript' ? '0.31.0' : '0.34.0';
      promoteSnapshot(
        snapshotDirectory(root, language),
        renderedPages(language, version, RELEASE),
        version,
        RELEASE
      );
    }

    const output = stableReferenceRoot(root);
    prepareStableReference(root, output);

    const tools = readFileSync(join(output, 'sdk-reference/typescript/tools.mdx'), 'utf8');
    expect(tools).toBe(readFileSync(join(snapshotDirectory(root, 'typescript'), 'pages/tools.mdx'), 'utf8'));
    expect(readFileSync(join(output, 'sdk-reference/python/index.mdx'), 'utf8'))
      .toContain('> SDK version `0.34.0`. Install with `pip install composio==0.34.0`.');
    expect(readFileSync(join(output, 'sdk-reference/python/index.mdx'), 'utf8'))
      .toContain('<PackageInstall ecosystem="python" packages="composio==0.34.0" />');
    expect(readFileSync(join(output, 'limits.mdx'), 'utf8')).toBe('Rate limits');
    // Unreleased workspace pages stay in the workspace and out of production.
    expect(() => readFileSync(join(output, 'sdk-reference/typescript/unreleased.mdx'))).toThrow();
    expect(readFileSync(join(sdk, 'typescript/unreleased.mdx'), 'utf8')).toBe('Unreleased class');
    expect(() => prepareStableReference(root, reference)).toThrow('Invalid stable reference destination');

    expect(resolveStableReferenceSource(root, output, join(output, 'sdk-reference/typescript/tools.mdx')))
      .toBe(join(snapshotDirectory(root, 'typescript'), 'pages/tools.mdx'));
    expect(resolveStableReferenceSource(root, output, join(output, 'limits.mdx')))
      .toBe(join(reference, 'limits.mdx'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('snapshot verification rejects tampering, unexpected files, and meta.json drift', () => {
  withSnapshot((directory, pages) => {
    promoteSnapshot(directory, pages, '0.31.0', RELEASE);

    writeFileSync(join(directory, 'pages/tools.mdx'), 'tampered');
    expect(() => verifySnapshot(directory)).toThrow('digest mismatch');
    expect(() => assertFrozenSnapshot(directory, 'typescript')).toThrow('digest mismatch');
    writeFileSync(join(directory, 'pages/tools.mdx'), pages.find(page => page.name === 'tools.mdx')!.source);

    writeFileSync(join(directory, 'pages/extra.mdx'), '---\ntitle: Extra\n---\n');
    expect(() => pageNames(join(directory, 'pages'))).toThrow('do not match meta.json');
    rmSync(join(directory, 'pages/extra.mdx'));

    mkdirSync(join(directory, 'pages/nested'));
    expect(() => pageNames(join(directory, 'pages'))).toThrow('Unexpected SDK reference file');
  });
});
