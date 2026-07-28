import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectBoundaryManifest,
  compareBoundaryManifests,
  parseBoundarySites,
} from '../../../scripts/lint-boundaries';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('lint boundary manifest', () => {
  it('includes both TypeScript and TSX source files', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-lint-boundaries-'));
    const sourceRoot = path.join(packageRoot, 'src');
    temporaryDirectories.push(packageRoot);
    fs.mkdirSync(sourceRoot);
    fs.writeFileSync(path.join(sourceRoot, 'plain.ts'), 'export const plain = true;\n');
    fs.writeFileSync(
      path.join(sourceRoot, 'component.tsx'),
      [
        '// eslint-disable-next-line no-restricted-syntax -- import-time runtime bridge',
        'export const Component = () => process.env.COMPONENT_NAME;',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(sourceRoot, 'ignored.js'),
      [
        '// eslint-disable-next-line no-restricted-syntax -- should not be scanned',
        'export const ignored = process.env.IGNORED;',
      ].join('\n')
    );

    expect(collectBoundaryManifest(packageRoot, sourceRoot)).toEqual({
      errors: [],
      manifest: {
        'src/component.tsx': [
          {
            reason: 'import-time runtime bridge',
            rule: 'no-restricted-syntax',
            target: 'export const Component = () => process.env.COMPONENT_NAME;',
          },
        ],
      },
    });
  });

  it('rejects the oxlint-disable spelling instead of letting it bypass the manifest', () => {
    const parsed = parseBoundarySites(
      'src/example.ts',
      [
        '// oxlint-disable-next-line eslint-js/no-restricted-syntax -- sneaky bypass',
        'const apiKey = process.env.COMPOSIO_API_KEY;',
      ].join('\n')
    );

    expect(parsed.sites).toHaveLength(0);
    expect(parsed.errors).toEqual([
      expect.stringContaining('src/example.ts:1: only "// eslint-disable-next-line'),
    ]);
  });

  it('rejects a file-wide oxlint-disable comment', () => {
    const parsed = parseBoundarySites(
      'src/example.ts',
      ['/* oxlint-disable */', 'const apiKey = process.env.COMPOSIO_API_KEY;'].join('\n')
    );

    expect(parsed.sites).toHaveLength(0);
    expect(parsed.errors).toHaveLength(1);
  });

  it('rejects moving a registered disable to another target in the same file', () => {
    const registered = parseBoundarySites(
      'src/example.ts',
      [
        '// eslint-disable-next-line no-restricted-syntax -- runtime environment bridge',
        'const apiKey = process.env.COMPOSIO_API_KEY;',
      ].join('\n')
    );
    const relocated = parseBoundarySites(
      'src/example.ts',
      [
        '// eslint-disable-next-line no-restricted-syntax -- runtime environment bridge',
        'const debug = process.env.DEBUG;',
      ].join('\n')
    );

    const errors = compareBoundaryManifests(
      { 'src/example.ts': [...relocated.sites] },
      { 'src/example.ts': [...registered.sites] }
    );

    expect(errors).toHaveLength(2);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('process.env.COMPOSIO_API_KEY'),
        expect.stringContaining('process.env.DEBUG'),
      ])
    );
  });

  it('preserves duplicate semantic sites as a deterministic multiset', () => {
    const directive =
      '// eslint-disable-next-line no-restricted-syntax -- runtime environment bridge';
    const target = 'process.env.COMPOSIO_API_KEY = apiKey;';
    const registered = parseBoundarySites(
      'src/example.ts',
      [directive, target, directive, target].join('\n')
    );
    const found = parseBoundarySites('src/example.ts', [directive, target].join('\n'));

    expect(
      compareBoundaryManifests(
        { 'src/example.ts': [...found.sites] },
        { 'src/example.ts': [...registered.sites] }
      )
    ).toEqual([expect.stringContaining('manifest registers 2x "no-restricted-syntax"')]);
  });
});
