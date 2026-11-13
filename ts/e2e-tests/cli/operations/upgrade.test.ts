/**
 * Upgrade faults: `composio upgrade` against a fake GitHub that publishes
 * releases with something wrong. The invariant in every row is that a failed
 * upgrade leaves the installed executable untouched and runnable.
 *
 * The successful replacement itself is covered by `../upgrade`, which hands
 * the CLI a local bundle; here the release metadata and the download are real
 * HTTP, and only the archive bytes are not a real build.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import type { Release } from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig, type CommandResult } from '@e2e-tests/cli-fake-backend/rig';
import { clean, RIG_TIMEOUT_MS, TEST_TIMEOUT_MS, writeDebugLog } from './support';

const EXECUTABLE = '/usr/local/bin/composio';
const TAG = '@composio/cli@2.0.0';
const NOT_A_ZIP = new TextEncoder().encode('not a zip archive\n');
const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const text = (value: string) => new TextEncoder().encode(value);

describe('upgrade faults', () => {
  let rig: CliRig;
  let archive: string;
  let fingerprintBefore: string;

  /** Inode, size, and mtime: any replacement or rewrite of the executable changes one of them. */
  const fingerprint = async () => (await rig.run(`stat -c '%i %s %Y' ${EXECUTABLE}`)).stdout.trim();

  const publish = (...releases: Release[]) => {
    rig.fake.world.releases.length = 0;
    rig.fake.world.releases.push(...releases);
  };

  const expectUntouched = async (result: CommandResult) => {
    expect(result.stdout).toBe('');
    expect(await fingerprint()).toBe(fingerprintBefore);
    const version = await rig.run('composio version');
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  };

  const downloads = (result: CommandResult) =>
    result.requests.filter(entry => entry.route === 'github.releases.download');

  beforeAll(async () => {
    rig = await startCliRig({ label: 'upgrade' });
    const machine = (await rig.run('uname -m')).stdout.trim();
    archive = `composio-linux-${machine === 'aarch64' ? 'aarch64' : 'x64'}.zip`;
    fingerprintBefore = await fingerprint();
  }, RIG_TIMEOUT_MS);

  afterEach(() => rig.fake.faults.clear());

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'upgrade');
    await rig.stop();
  });

  it(
    'no asset for this platform: fails before downloading anything',
    async () => {
      publish({
        tag: TAG,
        prerelease: false,
        assets: [{ name: 'composio-darwin-aarch64.zip', read: () => NOT_A_ZIP }],
      });
      const result = await rig.run('composio upgrade');
      expect(result.exitCode).toBe(1);
      expect(clean(result.stderr)).toContain(`No stable CLI releases found with ${archive}`);
      expect(downloads(result)).toEqual([]);
      await expectUntouched(result);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'checksum mismatch: the archive is rejected before extraction',
    async () => {
      publish({
        tag: TAG,
        prerelease: false,
        assets: [
          { name: archive, read: () => NOT_A_ZIP },
          { name: 'checksums.txt', read: () => text(`${'0'.repeat(64)}  ${archive}\n`) },
        ],
      });
      const result = await rig.run('composio upgrade');
      expect(result.exitCode).toBe(1);
      const stderr = clean(result.stderr);
      expect(stderr).toContain(`Checksum mismatch for ${archive}`);
      expect(stderr).toContain(sha256(NOT_A_ZIP));
      expect(stderr).not.toContain('Failed to extract');
      await expectUntouched(result);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a corrupt archive with a matching checksum: fails at extraction',
    async () => {
      publish({
        tag: TAG,
        prerelease: false,
        assets: [
          { name: archive, read: () => NOT_A_ZIP },
          { name: 'checksums.txt', read: () => text(`${sha256(NOT_A_ZIP)}  ${archive}\n`) },
        ],
      });
      const result = await rig.run('composio upgrade');
      expect(result.exitCode).toBe(1);
      expect(clean(result.stderr)).toContain('Failed to extract zip archive');
      await expectUntouched(result);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a download cut off mid-body: fails without a second attempt',
    async () => {
      publish({ tag: TAG, prerelease: false, assets: [{ name: archive, read: () => NOT_A_ZIP }] });
      rig.fake.faults.inject({
        route: 'github.releases.download',
        fault: { kind: 'reset-mid-body' },
      });
      const result = await rig.run('composio upgrade');
      expect(result.exitCode).toBe(1);
      expect(clean(result.stderr)).toContain('Failed to read downloaded binary');
      expect(downloads(result)).toHaveLength(1);
      await expectUntouched(result);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a pinned version that was never released: names the tag it looked for',
    async () => {
      publish({ tag: TAG, prerelease: false, assets: [{ name: archive, read: () => NOT_A_ZIP }] });
      const result = await rig.run('composio upgrade 9.9.9');
      expect(result.exitCode).toBe(1);
      expect(clean(result.stderr)).toContain(
        'Failed to fetch tags/@composio/cli@9.9.9 release from GitHub'
      );
      expect(downloads(result)).toEqual([]);
      await expectUntouched(result);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a pinned version: downloads that release, not the latest one',
    async () => {
      const older = '@composio/cli@1.5.0';
      publish(
        { tag: TAG, prerelease: false, assets: [{ name: archive, read: () => NOT_A_ZIP }] },
        { tag: older, prerelease: false, assets: [{ name: archive, read: () => NOT_A_ZIP }] }
      );
      const result = await rig.run('composio upgrade 1.5.0');
      // The archive is not a real build, so the upgrade still fails; which release it fetched is the point.
      expect(result.exitCode).toBe(1);
      expect(downloads(result).map(entry => decodeURIComponent(entry.path))).toEqual([
        `/ComposioHQ/composio/releases/download/${older}/${archive}`,
      ]);
      await expectUntouched(result);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'already on the latest release: succeeds without downloading',
    async () => {
      publish({ tag: TAG, prerelease: false, assets: [{ name: archive, read: () => NOT_A_ZIP }] });
      // A packaged install records its release next to the executable.
      await rig.journey.writeFile('/usr/local/bin/release-tag.txt', `${TAG}\n`);
      const result = await rig.run('composio upgrade');
      await rig.run('rm -f /usr/local/bin/release-tag.txt');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(downloads(result)).toEqual([]);
      expect(await fingerprint()).toBe(fingerprintBefore);
    },
    TEST_TIMEOUT_MS
  );
});
