import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertForwardSnapshot,
  prepareStableReference,
  promoteSnapshot,
  reviseSnapshot,
  snapshotDirectory,
  verifySnapshot,
} from '../../lib/sdk-reference-snapshot';

const RELEASE = '1'.repeat(40);
const NEXT_RELEASE = '2'.repeat(40);

function withReference(verify: (root: string, pages: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'sdk-reference-snapshot-'));
  try {
    const pages = join(root, 'pages');
    mkdirSync(pages);
    writeFileSync(join(pages, 'meta.json'), '{"pages":["tools"]}');
    writeFileSync(join(pages, 'index.mdx'), '---\ntitle: SDK\n---\n\nIndex text\n');
    writeFileSync(join(pages, 'tools.mdx'), '---\ntitle: Tools\n---\n\nStable tools\n');
    verify(root, pages);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('a release retry preserves the corrected revision and old promotions cannot downgrade it', () => {
  withReference((root, pages) => {
    const dir = snapshotDirectory(root, 'typescript');
    expect(promoteSnapshot(dir, pages, '0.31.0', RELEASE)).toBe(true);
    const initial = verifySnapshot(dir);
    const tools = join(dir, 'pages/tools.mdx');
    writeFileSync(tools, readFileSync(tools, 'utf8').replace('Stable tools', 'Corrected tools'));
    expect(() => verifySnapshot(dir)).toThrow('digest mismatch');
    expect(reviseSnapshot(dir)).toBe(true);
    const corrected = verifySnapshot(dir);
    expect(corrected.revision).toBe(2);
    expect(reviseSnapshot(dir)).toBe(false);
    expect(() => assertForwardSnapshot(initial, corrected)).not.toThrow();
    expect(() => assertForwardSnapshot(corrected, initial)).toThrow('Invalid SDK reference promotion');

    expect(promoteSnapshot(dir, pages, '0.31.0', RELEASE)).toBe(false);
    expect(promoteSnapshot(dir, pages, '0.30.0', RELEASE)).toBe(false);
    expect(verifySnapshot(dir)).toEqual(corrected);
    expect(promoteSnapshot(dir, pages, '0.32.0', NEXT_RELEASE)).toBe(true);
    const next = verifySnapshot(dir);
    expect(next.revision).toBe(1);
    expect(() => assertForwardSnapshot(corrected, next)).not.toThrow();
    expect(() => assertForwardSnapshot(next, corrected)).toThrow('Invalid SDK reference promotion');
  });
});

test('the production collection uses both verified snapshots at the canonical reference paths', () => {
  withReference((root, pages) => {
    const worktreeReference = join(root, 'content/reference');
    const sdk = join(worktreeReference, 'sdk-reference');
    mkdirSync(join(sdk, 'typescript'), { recursive: true });
    writeFileSync(join(sdk, 'typescript/unreleased.mdx'), 'Unreleased class');
    writeFileSync(join(sdk, 'meta.json'), '{"pages":["typescript","python"]}');
    writeFileSync(join(worktreeReference, 'limits.mdx'), 'Other reference content');
    const output = join(root, 'assembly');
    mkdirSync(output);
    const ts = snapshotDirectory(root, 'typescript');
    const py = snapshotDirectory(root, 'python');
    promoteSnapshot(ts, pages, '0.31.0', RELEASE);

    expect(() => prepareStableReference(root, output)).toThrow('manifest.json');
    promoteSnapshot(py, pages, '0.34.0', RELEASE);
    prepareStableReference(root, output);
    expect(readFileSync(join(output, 'sdk-reference/typescript/tools.mdx'), 'utf8'))
      .toContain('npm install @composio/core@0.31.0');
    expect(readFileSync(join(output, 'sdk-reference/python/tools.mdx'), 'utf8'))
      .toContain('pip install composio==0.34.0');
    expect(readFileSync(join(output, 'limits.mdx'), 'utf8')).toBe('Other reference content');
    expect(existsSync(join(output, 'sdk-reference/typescript/unreleased.mdx'))).toBe(false);
    expect(existsSync(join(sdk, 'typescript/unreleased.mdx'))).toBe(true);
  });
});
