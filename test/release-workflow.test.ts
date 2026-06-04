#!/usr/bin/env node
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tsReleaseWorkflow = readFileSync(
  new URL('../.github/workflows/ts.release.yml', import.meta.url),
  'utf8'
);
const releaseScriptUrl = new URL('../ts/scripts/changeset-release.sh', import.meta.url);
const releaseScriptPath = releaseScriptUrl.pathname;
const releaseScript = readFileSync(releaseScriptUrl, 'utf8');
const buildCliWorkflow = readFileSync(
  new URL('../.github/workflows/build-cli-binaries.yml', import.meta.url),
  'utf8'
);
const installHealthCheck = readFileSync(
  new URL('../.github/workflows/cli.install-health-check.yml', import.meta.url),
  'utf8'
);

if (!tsReleaseWorkflow.includes('publish: pnpm changeset:release')) {
  throw new Error('ts.release.yml must use the repository-controlled changeset:release script');
}

if (packageJson.scripts?.['changeset:release'] !== 'bash ts/scripts/changeset-release.sh') {
  throw new Error('changeset:release must use the CLI-release filtering script');
}

if (!releaseScript.includes('pnpm changeset publish')) {
  throw new Error('release script must still publish non-CLI changeset packages');
}

if (!releaseScript.includes('New tag:[[:space:]]*@composio\\/cli@')) {
  throw new Error('release script must filter @composio/cli tag output before changesets/action creates GitHub releases');
}

// --- build-cli-binaries.yml: the CLI binary workflow is the sole, hardened release writer ---

// A single failed platform must never publish a partial set: fail-fast: false makes the build
// job `success` only when every matrix leg passes, gating the release job.
if (!buildCliWorkflow.includes('fail-fast: false')) {
  throw new Error('build-cli-binaries.yml build matrix must set fail-fast: false');
}

// The release must be built as a draft and only flipped to published after verification, so no
// anonymous consumer can observe a release before its assets are attached.
const draftCreateIdx = buildCliWorkflow.indexOf('--draft');
const verifyIdx = buildCliWorkflow.indexOf('select(.state == "uploaded")');
const publishIdx = buildCliWorkflow.indexOf('gh release edit "$RELEASE_TAG" --draft=false');

if (draftCreateIdx === -1) {
  throw new Error('build-cli-binaries.yml must create the release as a draft (--draft)');
}
if (verifyIdx === -1) {
  throw new Error('build-cli-binaries.yml must verify assets are fully uploaded (state == "uploaded")');
}
if (publishIdx === -1) {
  throw new Error('build-cli-binaries.yml must publish by flipping the draft (gh release edit --draft=false)');
}
if (!(draftCreateIdx < verifyIdx && verifyIdx < publishIdx)) {
  throw new Error('build-cli-binaries.yml must order steps draft → verify → publish');
}

// Beta status must survive the draft→publish flip (regression: the old single create set
// --prerelease at creation; the new flow must set it on the draft).
if (!buildCliWorkflow.includes('flags+=(--prerelease)')) {
  throw new Error('build-cli-binaries.yml must preserve --prerelease on the draft for beta releases');
}

// Per-tag concurrency prevents two runs clobbering the same release without serializing betas.
if (!buildCliWorkflow.includes('group: cli-release-${{ needs.prepare.outputs.release_tag }}')) {
  throw new Error('build-cli-binaries.yml release job must use per-tag concurrency keyed on the release tag');
}

// --- cli.install-health-check.yml: canary must exercise the failure-prone pinned path ---

// The bare no-arg `curl | bash` is asset-aware and self-heals to the previous good release, so
// the canary must additionally install the newest PUBLISHED release PINNED to actually catch a
// release shipped with missing assets.
//
// It must resolve the newest *published* GitHub release (drafts excluded), NOT `npm view`: npm's
// latest is bumped minutes before the binary workflow publishes the GitHub release, so pinning to
// it would 404 during the healthy publish gap and false-page.
if (installHealthCheck.includes('$(npm view')) {
  throw new Error('cli.install-health-check.yml must not pin to npm (races ahead of the GitHub release)');
}
if (!installHealthCheck.includes('gh release list --exclude-drafts --exclude-pre-releases')) {
  throw new Error('cli.install-health-check.yml must resolve the newest published release (drafts excluded)');
}
if (!installHealthCheck.includes('bash -s -- "${{ steps.resolve.outputs.tag }}"')) {
  throw new Error('cli.install-health-check.yml must install the resolved tag via the pinned path');
}

const fakeBin = mkdtempSync(join(tmpdir(), 'composio-release-test-'));
try {
  const fakePnpmPath = join(fakeBin, 'pnpm');
  writeFileSync(
    fakePnpmPath,
    `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "run build:packages")
    exit 0
    ;;
  "changeset publish")
    echo 'New tag: @composio/core@1.2.3'
    echo 'New tag: @composio/cli@9.9.9'
    echo 'release warning preserved' >&2
    exit 0
    ;;
  *)
    echo "unexpected pnpm invocation: $*" >&2
    exit 1
    ;;
esac
`
  );
  chmodSync(fakePnpmPath, 0o755);

  const result = spawnSync('bash', [releaseScriptPath], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
  });

  if (result.status !== 0) {
    throw new Error(`release script failed unexpectedly\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  if (!result.stdout.includes('New tag: @composio/core@1.2.3')) {
    throw new Error('release script must preserve non-CLI changeset tags');
  }

  if (result.stdout.includes('@composio/cli@9.9.9')) {
    throw new Error('release script must hide @composio/cli tags from changesets/action');
  }

  if (!result.stderr.includes('release warning preserved')) {
    throw new Error('release script must preserve changeset publish stderr');
  }
} finally {
  rmSync(fakeBin, { recursive: true, force: true });
}

console.log('release workflow test passed');
