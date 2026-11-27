import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import {
  normalizeArtifactDigest,
  reuseCandidate,
  verifyArchive,
  verifyCandidateFiles,
} from '../scripts/sdk-release/artifacts';
import { runRelease } from './sdk-release-harness';

const head = 'b'.repeat(40);
const base = 'a'.repeat(40);
const files = [{ name: 'package.tgz', sha256: 'a'.repeat(64), size: 4 }];
const artifact = {
  id: 42,
  name: 'sdk-candidate-typescript',
  digest: `sha256:${'b'.repeat(64)}`,
  expired: false,
  expires_at: '2026-12-01T00:00:00Z',
  workflow_run: { id: 8, head_sha: head },
  created_at: '2026-11-01T00:00:00Z',
};
describe('immutable candidates', () => {
  test('native upload and REST digests normalize without accepting malformed hashes', async () => {
    const raw = 'a'.repeat(64);
    expect(await runRelease(normalizeArtifactDigest(raw))).toBe(`sha256:${raw}`);
    expect(await runRelease(normalizeArtifactDigest(`sha256:${raw}`))).toBe(`sha256:${raw}`);
    await expect(runRelease(normalizeArtifactDigest(`sha256:${raw.slice(1)}`))).rejects.toThrow();
    await expect(runRelease(normalizeArtifactDigest(`md5:${raw}`))).rejects.toThrow();
  });
  test('reuses IDs only from the original source and producer', async () => {
    const reused = await runRelease(
      reuseCandidate([artifact], artifact.name, 8, head, Date.parse('2026-11-03'))
    );
    expect(Option.getOrUndefined(reused)?.id).toBe(42);
    await expect(runRelease(reuseCandidate([artifact], artifact.name, 9, head))).rejects.toThrow(
      'Candidate source or producer does not match'
    );
    await expect(runRelease(reuseCandidate([artifact], artifact.name, 8, base))).rejects.toThrow(
      'Candidate source or producer does not match'
    );
    await expect(
      runRelease(reuseCandidate([{ ...artifact, expired: true }], artifact.name, 8, head))
    ).rejects.toThrow('Original candidate unavailable');
  });
  test('archive digest and every file checksum fail closed', async () => {
    await expect(runRelease(verifyArchive(new Uint8Array([1]), artifact.digest))).rejects.toThrow(
      'Actions artifact archive digest mismatch'
    );
    await expect(
      runRelease(
        verifyCandidateFiles(new Map([['package.tgz', new Uint8Array([1, 2, 3, 4])]]), files)
      )
    ).rejects.toThrow('Candidate checksum mismatch: package.tgz');
  });
});
