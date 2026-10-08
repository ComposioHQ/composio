import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import {
  assertBytesMatchIntegrity,
  expectedIntegrityFor,
  findLockfilePath,
  loadLockfileIntegrity,
  parseLockfileIntegrity,
  TarballIntegrityError,
} from '../../../scripts/_tarball-integrity';

/**
 * A pnpm v9 lockfile excerpt covering the shapes that matter: a quoted scoped
 * key, an unquoted bare key, an entry whose resolution carries no integrity,
 * and a `snapshots:` repeat of a key already seen in `packages:`.
 */
const LOCKFILE = `lockfileVersion: '9.0'

packages:

  '@zed-industries/codex-acp-linux-x64@0.16.0':
    resolution: {integrity: sha512-xs5zZBLpJuciEbZNx6ZSNL0qCa9h3i/zWpj40sp6QtF+L4Ow/7qzHdBzboGhHdcz1jrLedfZeRFDA2Elj8TLMA==}
    cpu: [x64]
    os: [linux]
    hasBin: true

  extract-zip@2.0.1:
    resolution: {integrity: sha512-GDhU9ntwuKyGXdZBUgTIe+vXnWj0fppUEtMDL0+idd5Sta8TGpHssn/eusA9mrPr9qNDym6SxAYZjNvCn/9RBg==}
    engines: {node: '>= 10.17.0'}

  some-git-dep@1.0.0:
    resolution: {type: git, repo: git@example.test:owner/repo.git, commit: abc123}

snapshots:

  extract-zip@2.0.1:
    dependencies:
      debug: 4.4.3
`;

const integrityOf = async (bytes: Uint8Array, prefix = 'sha512'): Promise<string> => {
  const algorithm = prefix === 'sha512' ? 'SHA-512' : 'SHA-256';
  const digest = await crypto.subtle.digest(algorithm, bytes as BufferSource);
  return `${prefix}-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
};

const tempDirs: Array<string> = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tarball-integrity-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { force: true, recursive: true })));
});

describe('parseLockfileIntegrity', () => {
  it('reads quoted scoped keys and unquoted bare keys', () => {
    const parsed = parseLockfileIntegrity(LOCKFILE);

    expect(parsed.get('@zed-industries/codex-acp-linux-x64@0.16.0')).toBe(
      'sha512-xs5zZBLpJuciEbZNx6ZSNL0qCa9h3i/zWpj40sp6QtF+L4Ow/7qzHdBzboGhHdcz1jrLedfZeRFDA2Elj8TLMA=='
    );
    expect(parsed.get('extract-zip@2.0.1')).toBe(
      'sha512-GDhU9ntwuKyGXdZBUgTIe+vXnWj0fppUEtMDL0+idd5Sta8TGpHssn/eusA9mrPr9qNDym6SxAYZjNvCn/9RBg=='
    );
  });

  it('skips resolutions that carry no integrity', () => {
    expect(parseLockfileIntegrity(LOCKFILE).has('some-git-dep@1.0.0')).toBe(false);
  });

  it('is empty for a lockfile with no packages', () => {
    expect(parseLockfileIntegrity("lockfileVersion: '9.0'\n").size).toBe(0);
  });
});

describe('expectedIntegrityFor', () => {
  const parsed = parseLockfileIntegrity(LOCKFILE);

  it('returns the pinned hash for a package the lockfile resolved', () => {
    expect(expectedIntegrityFor(parsed, 'extract-zip', '2.0.1')).toMatch(/^sha512-/);
  });

  it('refuses a package the lockfile never resolved', () => {
    expect(() => expectedIntegrityFor(parsed, 'extract-zip', '9.9.9')).toThrow(
      TarballIntegrityError
    );
  });

  it('refuses a version the lockfile pins under a different number', () => {
    expect(() =>
      expectedIntegrityFor(parsed, '@zed-industries/codex-acp-linux-x64', '0.17.0')
    ).toThrow(/no integrity hash/);
  });
});

describe('assertBytesMatchIntegrity', () => {
  const bytes = new TextEncoder().encode('codex-acp binary bytes');

  it('accepts bytes that hash to the expected value', async () => {
    await expect(
      assertBytesMatchIntegrity(bytes, await integrityOf(bytes), 'pkg@1.0.0')
    ).resolves.toBeUndefined();
  });

  it('rejects bytes swapped after the hash was pinned', async () => {
    const tampered = new TextEncoder().encode('codex-acp binary bytes + backdoor');

    await expect(
      assertBytesMatchIntegrity(tampered, await integrityOf(bytes), 'pkg@1.0.0')
    ).rejects.toThrow(TarballIntegrityError);
  });

  it('rejects a single flipped byte', async () => {
    const tampered = new Uint8Array(bytes);
    tampered[0] ^= 0xff;

    await expect(
      assertBytesMatchIntegrity(tampered, await integrityOf(bytes), 'pkg@1.0.0')
    ).rejects.toThrow(TarballIntegrityError);
  });

  it('names the package and both hashes so a mismatch is diagnosable', async () => {
    const tampered = new TextEncoder().encode('other');

    await expect(
      assertBytesMatchIntegrity(tampered, await integrityOf(bytes), 'pkg@1.0.0')
    ).rejects.toThrow(/pkg@1\.0\.0[\s\S]*Expected:[\s\S]*Actual:/);
  });

  it('rejects an integrity string whose algorithm it cannot compute', async () => {
    await expect(assertBytesMatchIntegrity(bytes, 'md6-abcdef', 'pkg@1.0.0')).rejects.toThrow(
      /Unsupported integrity algorithm/
    );
  });

  it('verifies under whichever sha algorithm the lockfile used', async () => {
    await expect(
      assertBytesMatchIntegrity(bytes, await integrityOf(bytes, 'sha256'), 'pkg@1.0.0')
    ).resolves.toBeUndefined();
  });
});

describe('findLockfilePath', () => {
  it('walks up from a nested directory to the workspace lockfile', async () => {
    const root = await makeTempDir();
    const nested = path.join(root, 'ts', 'packages', 'cli', 'scripts');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, 'pnpm-lock.yaml'), LOCKFILE, 'utf8');

    await expect(findLockfilePath(nested)).resolves.toBe(path.join(root, 'pnpm-lock.yaml'));
  });

  it('fails closed when no lockfile exists above the start directory', async () => {
    const root = await makeTempDir();

    await expect(findLockfilePath(root)).rejects.toThrow(TarballIntegrityError);
  });
});

describe('loadLockfileIntegrity', () => {
  it('parses the nearest lockfile found above the start directory', async () => {
    const root = await makeTempDir();
    const nested = path.join(root, 'scripts');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, 'pnpm-lock.yaml'), LOCKFILE, 'utf8');

    const parsed = await loadLockfileIntegrity(nested);

    expect(parsed.get('extract-zip@2.0.1')).toMatch(/^sha512-/);
  });
});

/**
 * Named literally rather than imported from `RUN_CODEX_ACP_BINARY_TARGETS`, for
 * the same reason `verify-archive-companions.sh` spells its list out: importing
 * that module pulls in `@composio/core`, and this file otherwise needs nothing
 * built. Adding a codex target there must extend this list.
 */
const CODEX_ACP_PACKAGES = [
  '@zed-industries/codex-acp-darwin-arm64',
  '@zed-industries/codex-acp-darwin-x64',
  '@zed-industries/codex-acp-linux-arm64',
  '@zed-industries/codex-acp-linux-x64',
];

describe('this repository', () => {
  it('pins an integrity hash for every codex-acp binary the release packages', async () => {
    const parsed = await loadLockfileIntegrity(path.dirname(fileURLToPath(import.meta.url)));
    const keys = [...parsed.keys()];

    for (const packageName of CODEX_ACP_PACKAGES) {
      expect(
        keys.find(key => key.startsWith(`${packageName}@`)),
        `${packageName} has no integrity hash in pnpm-lock.yaml`
      ).toBeDefined();
    }
  });
});
