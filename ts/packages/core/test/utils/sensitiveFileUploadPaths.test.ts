import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, mkdirSync } from 'node:fs';
import {
  assertSafeFileUploadPath,
  isBlockedSensitiveFileUploadPath,
} from '../../src/utils/sensitiveFileUploadPaths';
import * as publicApi from '../../src';

describe('sensitiveFileUploadPaths', () => {
  it('allows normal project files', () => {
    const p = path.join('/tmp', 'composio-test', 'document.pdf');
    expect(isBlockedSensitiveFileUploadPath(p)).toBe(false);
    expect(() => assertSafeFileUploadPath(p)).not.toThrow();
  });

  it('blocks common credential directory segments', () => {
    expect(isBlockedSensitiveFileUploadPath(path.join(os.homedir(), '.aws', 'credentials'))).toBe(
      true
    );
    expect(isBlockedSensitiveFileUploadPath(path.join(os.homedir(), '.ssh', 'id_ed25519'))).toBe(
      true
    );
    expect(
      isBlockedSensitiveFileUploadPath(path.join(os.homedir(), '.claude', 'settings.json'))
    ).toBe(true);
  });

  it('blocks .env-style basenames', () => {
    expect(isBlockedSensitiveFileUploadPath(path.join('/app', 'repo', '.env'))).toBe(true);
    expect(isBlockedSensitiveFileUploadPath(path.join('/app', 'repo', '.env.local'))).toBe(true);
  });

  it('blocks default private key basenames (defense in depth)', () => {
    expect(isBlockedSensitiveFileUploadPath(path.join('/tmp', 'id_ed25519'))).toBe(true);
  });

  it('does not block public key files by basename', () => {
    expect(isBlockedSensitiveFileUploadPath(path.join('/tmp', 'id_ed25519.pub'))).toBe(false);
  });

  it('honors additional deny segments from config', () => {
    expect(
      isBlockedSensitiveFileUploadPath(path.join('/data', 'secrets', 'x.txt'), ['secrets'])
    ).toBe(true);
    expect(isBlockedSensitiveFileUploadPath(path.join('/data', 'ok', 'x.txt'), ['secrets'])).toBe(
      false
    );
  });

  it('is re-exported from the package root for downstream consumers (e.g. @composio/cli)', () => {
    // The CLI imports the guard from `@composio/core` to share this one denylist
    // (issue #3746). Lock the public surface so a refactor cannot silently drop it.
    expect(typeof publicApi.assertSafeFileUploadPath).toBe('function');
    expect(typeof publicApi.isBlockedSensitiveFileUploadPath).toBe('function');
    expect(Array.isArray(publicApi.BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS)).toBe(true);
    expect(publicApi.BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS).toContain('.ssh');
  });

  it('blocks after realpath resolves a symlink into a sensitive directory', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'composio-symlink-'));
    try {
      const awsDir = path.join(root, 'nested', '.aws');
      mkdirSync(awsDir, { recursive: true });
      const target = path.join(awsDir, 'creds');
      writeFileSync(target, 'x');
      const link = path.join(root, 'innocent-name');
      symlinkSync(target, link);
      expect(isBlockedSensitiveFileUploadPath(link)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
