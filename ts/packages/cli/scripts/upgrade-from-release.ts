#!/usr/bin/env bun

/**
 * Check that a published CLI release can upgrade itself to a candidate archive.
 *
 * Usage: `bun scripts/upgrade-from-release.ts --archive dist/binaries/<artifact>.zip [--from <tag>] [--to <tag>]`
 *
 * Installs the `--from` release (default: the latest stable one) for the
 * archive's platform into a scratch directory, serves the candidate archive
 * from a local stand-in for GitHub's release API, runs the released binary's
 * `composio upgrade`, and checks that the upgraded install reports the
 * candidate's version and runs a script. `--to` names the candidate's release
 * tag (default `$RELEASE_TAG`), which must be the tag baked into the archive.
 *
 * This is the check for changes to what release archives contain: released
 * clients validate an upgrade archive before they replace themselves.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { CLI_RELEASE_TAG_PREFIX } from '../src/utils/cli-release-version';
import { fetchReleaseByTag, findLatestStableCliRelease } from './_github-releases';
import { archiveExecutableName } from './_release-artifacts';

const OWNER = 'ComposioHQ';
const REPO = 'composio';

class UpgradeCheckError extends Error {}

const fail = (message: string): never => {
  throw new UpgradeCheckError(message);
};

const sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** The hash `checksums.txt` (`<sha256>  <file>` lines) lists for `fileName`. */
const checksumFor = (checksums: string, fileName: string): string | undefined =>
  checksums
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .find(([, name]) => name === fileName)?.[0];

const { values } = parseArgs({
  options: { archive: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
});
const archivePath = path.resolve(values.archive ?? fail('pass --archive <path to zip>'));
const artifact = path.basename(archivePath, '.zip');
const toTag =
  values.to ?? process.env.RELEASE_TAG?.trim() ?? fail('pass --to <tag> or set RELEASE_TAG');
const toVersion = toTag.slice(CLI_RELEASE_TAG_PREFIX.length);

const candidate = new Uint8Array(await readFile(archivePath));
const checksums = `${sha256(candidate)}  ${artifact}.zip\n`;

// A stand-in for the GitHub release API, serving only the candidate release.
const serveCandidate = (request: Request, base: string): Response => {
  const { pathname } = new URL(request.url);
  const release = {
    tag_name: toTag,
    name: toTag,
    prerelease: toVersion.includes('-'),
    draft: false,
    assets: [
      {
        name: `${artifact}.zip`,
        browser_download_url: `${base}/assets/${artifact}.zip`,
        size: candidate.byteLength,
      },
      {
        name: 'checksums.txt',
        browser_download_url: `${base}/assets/checksums.txt`,
        size: checksums.length,
      },
    ],
  };
  const releasesPath = `/repos/${OWNER}/${REPO}/releases`;
  if (pathname === releasesPath) return Response.json([release]);
  if (pathname.startsWith(`${releasesPath}/tags/`)) {
    const tag = decodeURIComponent(pathname.slice(`${releasesPath}/tags/`.length));
    return tag === toTag ? Response.json(release) : new Response('Not Found', { status: 404 });
  }
  if (pathname === `/assets/${artifact}.zip`) return new Response(candidate);
  if (pathname === '/assets/checksums.txt') return new Response(checksums);
  process.stderr.write(`stand-in GitHub API: no route for ${request.method} ${pathname}\n`);
  return new Response('Not Found', { status: 404 });
};

const download = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) fail(`${url} returned ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

const checkUpgrade = async (workDir: string, apiBaseUrl: string): Promise<void> => {
  const installDir = path.join(workDir, 'install');
  const homeDir = path.join(workDir, 'home');
  // The released binary gets only what it needs: no tokens from this process.
  const env = {
    PATH: process.env.PATH ?? '',
    ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
    HOME: homeDir,
    USERPROFILE: homeDir,
    COMPOSIO_CACHE_DIR: path.join(homeDir, '.composio'),
    COMPOSIO_DISABLE_TELEMETRY: 'true',
    COMPOSIO_GITHUB_API_BASE_URL: apiBaseUrl,
    COMPOSIO_GITHUB_OWNER: OWNER,
    COMPOSIO_GITHUB_REPO: REPO,
  };

  const fromRelease =
    values.from === undefined
      ? ((await findLatestStableCliRelease()) ?? fail('no stable CLI release found'))
      : await fetchReleaseByTag(values.from);
  const assetUrl = (name: string): string =>
    fromRelease.assets.find(asset => asset.name === name)?.browser_download_url ??
    fail(`${fromRelease.tag_name} has no ${name}`);

  process.stderr.write(`Installing ${fromRelease.tag_name} (${artifact})...\n`);
  const fromZipBytes = await download(assetUrl(`${artifact}.zip`));
  const fromChecksums = new TextDecoder().decode(await download(assetUrl('checksums.txt')));
  if (checksumFor(fromChecksums, `${artifact}.zip`) !== sha256(fromZipBytes)) {
    fail(`${fromRelease.tag_name} ${artifact}.zip does not match its checksums.txt`);
  }
  const fromZip = path.join(workDir, `from-${artifact}.zip`);
  await Bun.write(fromZip, fromZipBytes);
  await $`mkdir -p ${installDir} ${homeDir}`.quiet();
  await $`unzip -q ${fromZip} -d ${workDir}/from`.quiet();
  await $`cp -R ${workDir}/from/${artifact}/. ${installDir}`.quiet();
  const binary = path.join(installDir, archiveExecutableName(artifact));

  process.stderr.write(`Upgrading ${fromRelease.tag_name} to ${toTag}...\n`);
  const upgrade = await $`${binary} upgrade ${toVersion}`.env(env).nothrow();
  process.stderr.write(upgrade.stdout.toString() + upgrade.stderr.toString());
  if (upgrade.exitCode !== 0) fail(`composio upgrade exited ${upgrade.exitCode}`);

  const version = (await $`${binary} --version`.env(env).text()).trim();
  if (version !== toVersion) fail(`upgraded binary reports ${version}, expected ${toVersion}`);

  const run = await $`${binary} run ${'40 + 2'}`.env(env).nothrow();
  if (run.exitCode !== 0 || !run.stdout.toString().includes('42')) {
    fail(`composio run failed after the upgrade (exit ${run.exitCode}): ${run.stderr.toString()}`);
  }
  process.stderr.write(`${fromRelease.tag_name} upgraded to ${toTag}; --version and run pass.\n`);
};

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: request => serveCandidate(request, new URL(request.url).origin),
});
const workDir = await mkdtemp(path.join(os.tmpdir(), 'composio-upgrade-'));
let exitCode = 0;
try {
  await checkUpgrade(workDir, server.url.origin);
} catch (error) {
  const message = error instanceof UpgradeCheckError ? error.message : String(error);
  process.stderr.write(`upgrade-from-release: ${message}\n`);
  exitCode = 1;
} finally {
  await server.stop(true);
  await rm(workDir, { recursive: true, force: true });
}
process.exit(exitCode);
