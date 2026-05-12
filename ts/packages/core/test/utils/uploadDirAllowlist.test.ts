import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, mkdirSync } from 'node:fs';
import { assertPathInsideUploadDirs } from '../../src/utils/uploadDirAllowlist.node';
import { resolveEffectiveUploadAllowlist, getDefaultUploadDir } from '../../src/utils/fileDirs';
import {
  ComposioFileNotFoundError,
  ComposioFileUploadPathNotAllowedError,
} from '../../src/errors/FileModifierErrors';

describe('resolveEffectiveUploadAllowlist', () => {
  it('returns the default [<home>/.composio/temp] when userDirs is undefined', () => {
    const out = resolveEffectiveUploadAllowlist(undefined);
    const def = getDefaultUploadDir();
    expect(def).not.toBeNull();
    expect(out).toEqual([def]);
  });

  it('returns [] (fail-closed) when user passes []', () => {
    expect(resolveEffectiveUploadAllowlist([])).toEqual([]);
  });

  it('returns [] when user passes `false` (explicit "no local paths")', () => {
    expect(resolveEffectiveUploadAllowlist(false)).toEqual([]);
  });

  it('replaces the default when user passes explicit dirs', () => {
    const dirs = ['/tmp/one', '/tmp/two'];
    const out = resolveEffectiveUploadAllowlist(dirs);
    expect(out).toEqual(dirs.map(d => path.resolve(d)));
  });

  it('expands leading ~ in entries', () => {
    const out = resolveEffectiveUploadAllowlist(['~/foo']);
    expect(out[0]).toBe(path.resolve(os.homedir(), 'foo'));
  });
});

describe('assertPathInsideUploadDirs', () => {
  const makeTempRoot = () => mkdtempSync(path.join(os.tmpdir(), 'composio-allowlist-'));

  it('accepts a file inside an allowed directory', () => {
    const root = makeTempRoot();
    try {
      const file = path.join(root, 'hello.txt');
      writeFileSync(file, 'hi');
      expect(() => assertPathInsideUploadDirs(file, [root])).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws ComposioFileUploadPathNotAllowedError when path is outside all allowed dirs', () => {
    const root = makeTempRoot();
    const other = makeTempRoot();
    try {
      const file = path.join(root, 'hello.txt');
      writeFileSync(file, 'hi');
      expect(() => assertPathInsideUploadDirs(file, [other])).toThrow(
        ComposioFileUploadPathNotAllowedError
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('enforces component-boundary matching (does not treat sibling prefix as inside)', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-boundary-'));
    try {
      const allowed = path.join(root, 'uploads');
      const sibling = path.join(root, 'uploads-not-allowed');
      mkdirSync(allowed);
      mkdirSync(sibling);
      const file = path.join(sibling, 'leak.txt');
      writeFileSync(file, 'nope');
      expect(() => assertPathInsideUploadDirs(file, [allowed])).toThrow(
        ComposioFileUploadPathNotAllowedError
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects paths that escape via symlink (realpath is enforced)', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-symesc-'));
    try {
      const allowed = path.join(root, 'allowed');
      const outside = path.join(root, 'outside');
      mkdirSync(allowed);
      mkdirSync(outside);
      const target = path.join(outside, 'secret.txt');
      writeFileSync(target, 'x');
      const link = path.join(allowed, 'innocent.txt');
      symlinkSync(target, link);
      expect(() => assertPathInsideUploadDirs(link, [allowed])).toThrow(
        ComposioFileUploadPathNotAllowedError
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws ComposioFileNotFoundError when the file does not exist', () => {
    const root = makeTempRoot();
    try {
      const missing = path.join(root, 'does-not-exist.txt');
      expect(() => assertPathInsideUploadDirs(missing, [root])).toThrow(ComposioFileNotFoundError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws ComposioFileUploadPathNotAllowedError with empty allowlist (fail-closed)', () => {
    const root = makeTempRoot();
    try {
      const file = path.join(root, 'a.txt');
      writeFileSync(file, 'x');
      expect(() => assertPathInsideUploadDirs(file, [])).toThrow(
        ComposioFileUploadPathNotAllowedError
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('includes actionable guidance and the resolved path in the error message', () => {
    const root = makeTempRoot();
    try {
      const file = path.join(root, 'a.txt');
      writeFileSync(file, 'x');
      try {
        assertPathInsideUploadDirs(file, ['/tmp/definitely-not-here-xyz']);
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ComposioFileUploadPathNotAllowedError);
        const message = (err as Error).message;
        expect(message).toContain('fileUploadDirs');
        expect(message).toContain('dangerouslyAllowAutoUploadDownloadFiles');
        expect(message).toContain('~/.composio/temp');
        expect(message).toContain(file);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
