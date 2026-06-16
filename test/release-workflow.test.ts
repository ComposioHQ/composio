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
const resolveTargetScriptUrl = new URL(
  '../.github/scripts/cli-release/resolve-release-target.sh',
  import.meta.url
);
const resolveTargetScriptPath = resolveTargetScriptUrl.pathname;
const resolveTargetScript = readFileSync(resolveTargetScriptUrl, 'utf8');
const createDraftScript = readFileSync(
  new URL('../.github/scripts/cli-release/create-or-resume-draft.sh', import.meta.url),
  'utf8'
);
const verifyAssetsScript = readFileSync(
  new URL('../.github/scripts/cli-release/verify-assets.sh', import.meta.url),
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
// anonymous consumer can observe a release before its assets are attached. The draft and verify
// logic live in standalone scripts checked out from the workflow revision; the workflow must
// invoke them in helper checkout → draft → verify → publish order.
const helperCheckoutIdx = buildCliWorkflow.indexOf('name: Checkout workflow release helpers');
const draftStepIdx = buildCliWorkflow.indexOf(
  'bash "$RELEASE_HELPERS_DIR/create-or-resume-draft.sh"'
);
const verifyStepIdx = buildCliWorkflow.indexOf('bash "$RELEASE_HELPERS_DIR/verify-assets.sh"');
const publishIdx = buildCliWorkflow.indexOf('gh release edit "$RELEASE_TAG" --draft=false');

if (!buildCliWorkflow.includes("- '.github/scripts/cli-release/**'")) {
  throw new Error('build-cli-binaries.yml must trigger when CLI release helper scripts change');
}
if (helperCheckoutIdx === -1) {
  throw new Error('build-cli-binaries.yml must checkout workflow release helpers before publishing');
}
if (!buildCliWorkflow.includes('ref: ${{ github.workflow_sha }}')) {
  throw new Error('build-cli-binaries.yml must checkout release helpers from the workflow revision');
}
if (draftStepIdx === -1) {
  throw new Error('build-cli-binaries.yml must create the draft via create-or-resume-draft.sh');
}
if (verifyStepIdx === -1) {
  throw new Error('build-cli-binaries.yml must verify assets via verify-assets.sh');
}
if (publishIdx === -1) {
  throw new Error('build-cli-binaries.yml must publish by flipping the draft (gh release edit --draft=false)');
}
if (!(helperCheckoutIdx < draftStepIdx && draftStepIdx < verifyStepIdx && verifyStepIdx < publishIdx)) {
  throw new Error('build-cli-binaries.yml must order steps helper checkout → draft → verify → publish');
}

// The draft script must actually create a draft, and the verify gate must require fully-uploaded
// assets (not merely present) — that distinction is what stops a release serving 404s.
if (!createDraftScript.includes('--draft')) {
  throw new Error('create-or-resume-draft.sh must create the release as a draft (--draft)');
}
if (!verifyAssetsScript.includes('select(.state == "uploaded")')) {
  throw new Error('verify-assets.sh must require assets be fully uploaded (state == "uploaded")');
}

// Beta status must survive the draft→publish flip (regression: the old single create set
// --prerelease at creation; the new flow must set it on the draft).
if (!createDraftScript.includes('flags+=(--prerelease)')) {
  throw new Error('create-or-resume-draft.sh must preserve --prerelease on the draft for beta releases');
}

// Skills must be packaged BEFORE checksums are generated, so composio-skill.zip is hashed into
// checksums.txt rather than shipping unverifiable.
const packageSkillsIdx = buildCliWorkflow.indexOf('name: Package skill files');
const generateChecksumsIdx = buildCliWorkflow.indexOf('name: Generate checksums');
if (packageSkillsIdx === -1 || generateChecksumsIdx === -1) {
  throw new Error('build-cli-binaries.yml must package skills and generate checksums');
}
if (!(packageSkillsIdx < generateChecksumsIdx)) {
  throw new Error('build-cli-binaries.yml must package skills before generating checksums so the skill zip is checksummed');
}

// Per-tag concurrency prevents two runs clobbering the same release without serializing betas.
if (!buildCliWorkflow.includes('group: cli-release-${{ needs.prepare.outputs.release_tag }}')) {
  throw new Error('build-cli-binaries.yml release job must use per-tag concurrency keyed on the release tag');
}

// Release-target resolution lives in a standalone, unit-tested script (see executable tests
// below) rather than inline YAML bash, so the branching logic is reviewable and testable.
if (!buildCliWorkflow.includes('bash .github/scripts/cli-release/resolve-release-target.sh')) {
  throw new Error('build-cli-binaries.yml prepare job must delegate to resolve-release-target.sh');
}

// The "latest stable" lookup must sort by numeric semver, not lexically: a lexical sort ranks
// @composio/cli@0.2.9 above 0.2.10 and would regress beta versioning once a patch hits 2 digits.
if (!resolveTargetScript.includes('map(tonumber)')) {
  throw new Error('resolve-release-target.sh must sort releases by numeric semver (map(tonumber)), not lexically');
}
if (!resolveTargetScript.includes('--exclude-drafts')) {
  throw new Error('resolve-release-target.sh must exclude draft stable releases from beta base selection');
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
if (!installHealthCheck.includes('gh release list')) {
  throw new Error('cli.install-health-check.yml must resolve the newest published release (drafts excluded)');
}
if (!installHealthCheck.includes('--repo "${{ github.repository }}"')) {
  throw new Error('cli.install-health-check.yml must pass repository context to gh release list');
}
if (!installHealthCheck.includes('--limit 1000')) {
  throw new Error('cli.install-health-check.yml must look beyond the gh release list default limit');
}
if (
  !installHealthCheck.includes('--exclude-drafts') ||
  !installHealthCheck.includes('--exclude-pre-releases')
) {
  throw new Error('cli.install-health-check.yml must resolve the newest published release (drafts excluded)');
}
if (installHealthCheck.includes('.[0].tagName')) {
  throw new Error('cli.install-health-check.yml must not let jq null bypass the empty tag guard');
}
if (!installHealthCheck.includes("| sed -n '1p'")) {
  throw new Error('cli.install-health-check.yml must convert no matching release into empty output');
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

// --- resolve-release-target.sh: executable tests for the release-target branching ---
//
// The script shells out to `gh` and `curl`; we stub both on PATH and feed fixtures, so these
// exercise the real branching/version logic (not just substring presence). `jq`/`python3` stay
// real because the script's correctness depends on them.

const FAKE_GH = `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "release" && "\${2:-}" == "list" ]]; then
  shift 2
  jqexpr=""
  exclude_drafts=false
  limit=""
  while [[ \$# -gt 0 ]]; do
    if [[ "\$1" == "--exclude-drafts" ]]; then exclude_drafts=true; shift; continue; fi
    if [[ "\$1" == "--limit" ]]; then limit="\$2"; shift 2; continue; fi
    if [[ "\$1" == "--jq" ]]; then jqexpr="\$2"; shift 2; continue; fi
    shift
  done
  if [[ "\$exclude_drafts" != "true" ]]; then
    echo "release list must pass --exclude-drafts" >&2
    exit 1
  fi
  if [[ "\$limit" != "1000" ]]; then
    echo "release list must pass --limit 1000" >&2
    exit 1
  fi
  jq -r '[.[] | select(.isDraft != true)] | '"\$jqexpr" "\$GH_RELEASES_FIXTURE"
  exit 0
fi
if [[ "\${1:-}" == "release" && "\${2:-}" == "view" ]]; then
  # An existing release: echo its isDraft flag. Unset fixture ⇒ exit non-zero (release absent).
  if [[ -n "\${GH_VIEW_ISDRAFT:-}" ]]; then
    echo "\$GH_VIEW_ISDRAFT"
    exit 0
  fi
  exit 1
fi
echo "unexpected gh invocation: \$*" >&2
exit 1
`;

const FAKE_CURL = `#!/usr/bin/env bash
set -euo pipefail
cat "\$CURL_FIXTURE"
`;

function parseOutputs(text) {
  const outputs = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    outputs[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return outputs;
}

function runResolver({ env, releasesFixture, curlFixture, ghViewIsDraft }) {
  const fakeBin = mkdtempSync(join(tmpdir(), 'composio-fakebin-'));
  const workdir = mkdtempSync(join(tmpdir(), 'composio-resolver-'));
  try {
    for (const [name, body] of [['gh', FAKE_GH], ['curl', FAKE_CURL]]) {
      const p = join(fakeBin, name);
      writeFileSync(p, body);
      chmodSync(p, 0o755);
    }

    const outputPath = join(workdir, 'github_output');
    writeFileSync(outputPath, '');

    const fixtures = {};
    if (releasesFixture !== undefined) {
      const fixturePath = join(workdir, 'releases.json');
      writeFileSync(fixturePath, JSON.stringify(releasesFixture));
      fixtures.GH_RELEASES_FIXTURE = fixturePath;
    }
    if (curlFixture !== undefined) {
      const fixturePath = join(workdir, 'curl.json');
      writeFileSync(fixturePath, JSON.stringify(curlFixture));
      fixtures.CURL_FIXTURE = fixturePath;
    }
    if (ghViewIsDraft !== undefined) fixtures.GH_VIEW_ISDRAFT = ghViewIsDraft;

    const result = spawnSync('bash', [resolveTargetScriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputPath,
        ...fixtures,
        ...env,
      },
    });

    const output = readFileSync(outputPath, 'utf8');
    return { ...result, output, outputs: parseOutputs(output) };
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
    rmSync(workdir, { recursive: true, force: true });
  }
}

// build-beta bumps off the NUMERIC-latest stable release. The fixture deliberately interleaves
// 0.2.10 and 0.2.9: a lexical sort would pick 0.2.9 and resolve 0.2.10 here — regression lock.
{
  const r = runResolver({
    env: {
      EVENT_NAME: 'workflow_dispatch',
      ACTION_INPUT: 'build-beta',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '42',
      COMMIT_SHA: 'deadbeef',
    },
    releasesFixture: [
      { tagName: '@composio/cli@0.2.2', isPrerelease: false },
      { tagName: '@composio/cli@0.2.10', isPrerelease: false },
      { tagName: '@composio/cli@0.2.9', isPrerelease: false },
      // Draft stables must not become the base for rolling betas.
      { tagName: '@composio/cli@0.2.11', isPrerelease: false, isDraft: true },
      { tagName: '@composio/cli@0.3.0-beta.1', isPrerelease: true },
    ],
  });
  if (r.status !== 0) {
    throw new Error(`resolve-release-target.sh build-beta failed\nstderr:\n${r.stderr}`);
  }
  if (r.outputs.release_version !== '0.2.11') {
    throw new Error(
      `build-beta must bump off the numeric-latest stable (0.2.10 → 0.2.11), got release_version=${r.outputs.release_version}. A lexical sort would regress.`
    );
  }
  if (r.outputs.release_tag !== '@composio/cli@0.2.11-beta.42') {
    throw new Error(`build-beta release_tag wrong: ${r.outputs.release_tag}`);
  }
  if (r.outputs.prerelease !== 'true' || r.outputs.make_latest !== 'false') {
    throw new Error('build-beta must emit prerelease=true and make_latest=false');
  }
}

// promote-stable must REFUSE a tag that is already published (isDraft=false) and emit nothing.
{
  const r = runResolver({
    env: {
      EVENT_NAME: 'workflow_dispatch',
      ACTION_INPUT: 'promote-stable',
      BETA_TAG_INPUT: '@composio/cli@0.3.0-beta.5',
      GITHUB_TOKEN: 'fake-token',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '1',
      COMMIT_SHA: 'unused',
    },
    curlFixture: { prerelease: true, target_commitish: 'abc123' },
    ghViewIsDraft: 'false',
  });
  if (r.status === 0) {
    throw new Error('promote-stable must refuse an already-published stable tag');
  }
  if (!r.stderr.includes('already published')) {
    throw new Error(`promote-stable refusal must explain itself\nstderr:\n${r.stderr}`);
  }
  if (r.output.trim() !== '') {
    throw new Error('a refused promotion must not emit release outputs');
  }
}

// promote-stable happy path: no existing release ⇒ emit a stable target off the beta's commitish.
{
  const r = runResolver({
    env: {
      EVENT_NAME: 'workflow_dispatch',
      ACTION_INPUT: 'promote-stable',
      BETA_TAG_INPUT: '@composio/cli@0.3.0-beta.5',
      GITHUB_TOKEN: 'fake-token',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '1',
      COMMIT_SHA: 'unused',
    },
    curlFixture: { prerelease: true, target_commitish: 'abc123' },
    // ghViewIsDraft unset ⇒ `gh release view` exits non-zero ⇒ no existing release to refuse.
  });
  if (r.status !== 0) {
    throw new Error(`resolve-release-target.sh promote-stable failed\nstderr:\n${r.stderr}`);
  }
  if (r.outputs.release_tag !== '@composio/cli@0.3.0' || r.outputs.release_version !== '0.3.0') {
    throw new Error(`promote-stable must strip the -beta suffix, got ${r.outputs.release_tag}`);
  }
  if (r.outputs.prerelease !== 'false' || r.outputs.make_latest !== 'true') {
    throw new Error('promote-stable must emit prerelease=false and make_latest=true');
  }
  if (r.outputs.checkout_ref !== 'abc123') {
    throw new Error(`promote-stable must check out the beta's target_commitish, got ${r.outputs.checkout_ref}`);
  }
}

console.log('release workflow test passed');
