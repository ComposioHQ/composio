#!/usr/bin/env node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  findIgnoredChangesetReleases,
  validateChangesets,
} from '../ts/scripts/validate-changesets.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tsCorePackageJson = JSON.parse(
  readFileSync(new URL('../ts/packages/core/package.json', import.meta.url), 'utf8')
);
const changesetConfig = JSON.parse(
  readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8')
);
const tsReleaseWorkflow = readFileSync(
  new URL('../.github/workflows/ts.release.yml', import.meta.url),
  'utf8'
);
const pythonPyproject = readFileSync(new URL('../python/pyproject.toml', import.meta.url), 'utf8');
const pythonRuntimeVersionModule = readFileSync(
  new URL('../python/composio/__version__.py', import.meta.url),
  'utf8'
);
const pythonReleaseWorkflow = readFileSync(
  new URL('../.github/workflows/py.release.yml', import.meta.url),
  'utf8'
);
const pythonMakefilePath = new URL('../python/Makefile', import.meta.url).pathname;
const changesetBinPath = new URL('../node_modules/.bin/changeset', import.meta.url).pathname;
const releaseScriptUrl = new URL('../ts/scripts/changeset-release.sh', import.meta.url);
const releaseScriptPath = releaseScriptUrl.pathname;
const releaseScript = readFileSync(releaseScriptUrl, 'utf8');
const rootInstallGuide = readFileSync(new URL('../INSTALL.md', import.meta.url), 'utf8');
const buildCliWorkflow = readFileSync(
  new URL('../.github/workflows/build-cli-binaries.yml', import.meta.url),
  'utf8'
);
const buildAllCliBinariesScript = readFileSync(
  new URL('../ts/packages/cli/scripts/build-all-binaries.ts', import.meta.url),
  'utf8'
);
const installGuide = readFileSync(new URL('../INSTALL.md', import.meta.url), 'utf8');
const installHealthCheck = readFileSync(
  new URL('../.github/workflows/cli.install-health-check.yml', import.meta.url),
  'utf8'
);
const cliDocsGuide = readFileSync(new URL('../docs/content/docs/cli.mdx', import.meta.url), 'utf8');
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
const generateChecksumsScriptUrl = new URL(
  '../ts/packages/cli/scripts/generate-checksums.ts',
  import.meta.url
);
const generateChecksumsScriptPath = generateChecksumsScriptUrl.pathname;
const generateChecksumsScript = readFileSync(generateChecksumsScriptUrl, 'utf8');

function requireMatch(text, pattern, label) {
  const match = text.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not read ${label}`);
  }
  return match[1];
}

function readPyprojectVersion(text, label) {
  return requireMatch(text, /^\s*version\s*=\s*"([^"]+)"\s*$/m, label);
}

function readSdkVersions(rows) {
  const versions = new Set();
  const pythonVersionPattern =
    /\bv?(\d+(?:\.\d+)+(?:[._-]?(?:a|b|c|rc|alpha|beta|pre|preview)\d*)?(?:[._-]?(?:post|rev|r)\d*)?(?:[._-]?dev\d*)?(?:\+[a-z0-9]+(?:[._-][a-z0-9]+)*)?)\b/gi;

  for (const row of rows) {
    const cells = row
      .split('|')
      .map(cell => cell.trim())
      .filter(Boolean);
    const releaseVersionCell = cells[cells.length - 1];
    if (!releaseVersionCell) continue;

    for (const version of releaseVersionCell.matchAll(pythonVersionPattern)) {
      versions.add(version[1]);
    }
  }

  return versions;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readDocumentedSdkVersions(sdkLabel) {
  const changelogDir = new URL('../docs/content/changelog/', import.meta.url);
  const rowPattern = new RegExp(`^\\|\\s*${escapeRegExp(sdkLabel)}\\s*\\|.*$`, 'gm');
  const rows = [];

  for (const entry of readdirSync(changelogDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue;

    const source = readFileSync(
      new URL(`../docs/content/changelog/${entry.name}`, import.meta.url),
      'utf8'
    );
    rows.push(...(source.match(rowPattern) ?? []));
  }

  return readSdkVersions(rows);
}

function readTypeScriptWorkspacePackages() {
  const workspacePackages = [];

  for (const workspacePattern of packageJson.workspaces ?? []) {
    if (!workspacePattern.startsWith('ts/packages/')) continue;

    const workspacePaths = workspacePattern.endsWith('/*')
      ? readdirSync(new URL(`../${workspacePattern.slice(0, -2)}/`, import.meta.url), {
          withFileTypes: true,
        })
          .filter(entry => entry.isDirectory())
          .map(entry => `${workspacePattern.slice(0, -1)}${entry.name}`)
      : [workspacePattern];

    for (const workspacePath of workspacePaths) {
      const manifestUrl = new URL(`../${workspacePath}/package.json`, import.meta.url);
      if (!existsSync(manifestUrl)) continue;

      workspacePackages.push({
        manifest: JSON.parse(readFileSync(manifestUrl, 'utf8')),
        path: `${workspacePath}/package.json`,
      });
    }
  }

  return workspacePackages;
}

function runPythonBuildFixture({ providers, providerFiles = [], failingProvider = '' }) {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'composio-python-build-'));
  const buildLogPath = join(fixtureDir, 'build.log');

  try {
    mkdirSync(join(fixtureDir, '.venv/bin'), { recursive: true });
    mkdirSync(join(fixtureDir, 'providers'), { recursive: true });
    writeFileSync(buildLogPath, '');

    const fakePythonPath = join(fixtureDir, '.venv/bin/python');
    writeFileSync(
      fakePythonPath,
      `#!/usr/bin/env bash
set -euo pipefail
target="\${3:-}"
printf '%s\n' "\${target:-<root>}" >> "$BUILD_LOG"

if [[ -z "$target" ]]; then
  mkdir -p dist
  touch dist/root.whl
  exit 0
fi

target="\${target%/}"
if [[ "$target" == "$FAILING_PROVIDER" ]]; then
  exit 23
fi

mkdir -p "$target/dist"
touch "$target/dist/provider.whl"
`
    );
    chmodSync(fakePythonPath, 0o755);

    for (const provider of providers) {
      const providerDir = join(fixtureDir, 'providers', provider);
      mkdirSync(providerDir, { recursive: true });
      writeFileSync(join(providerDir, 'pyproject.toml'), '[build-system]\n');
    }
    for (const providerFile of providerFiles) {
      writeFileSync(join(fixtureDir, 'providers', providerFile), 'not a provider package\n');
    }

    const result = spawnSync('make', ['-f', pythonMakefilePath, 'build'], {
      cwd: fixtureDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        BUILD_LOG: buildLogPath,
        FAILING_PROVIDER: failingProvider ? `providers/${failingProvider}` : '',
      },
    });

    return {
      ...result,
      invocations: readFileSync(buildLogPath, 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

{
  const result = runPythonBuildFixture({
    providers: ['valid'],
    providerFiles: ['AGENTS.md'],
  });

  if (result.status !== 0) {
    throw new Error(
      `Python package build fixture failed unexpectedly\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  if (result.invocations.includes('providers/AGENTS.md')) {
    throw new Error('Python package build must skip non-provider files under python/providers');
  }
  if (!result.invocations.includes('providers/valid')) {
    throw new Error('Python package build must include provider directories with pyproject.toml');
  }
}

{
  const result = runPythonBuildFixture({
    providers: ['a-failing', 'z-valid'],
    failingProvider: 'a-failing',
  });

  if (result.status === 0) {
    throw new Error('Python package build must fail when a provider build fails');
  }
  if (!result.invocations.includes('providers/a-failing')) {
    throw new Error('Python package build fixture did not exercise the failing provider');
  }
  if (result.invocations.includes('providers/z-valid')) {
    throw new Error('Python package build must stop after the first provider failure');
  }
}

{
  const directVersion = readSdkVersions(['| Python `composio` | `9.9.9` |']);
  const versionWithPrevious = readSdkVersions(['| Python `composio` | v9.9.8 | **v9.9.9** |']);
  const previousVersionOnly = readSdkVersions(['| Python `composio` | v9.9.9 | **v9.9.10** |']);
  const pep440Versions = readSdkVersions([
    '| Python `composio` | `9.9.9rc1` |',
    '| Python `composio` | `9.9.9.post1` |',
    '| Python `composio` | `9.9.9.dev1` |',
  ]);

  if (!directVersion.has('9.9.9') || !versionWithPrevious.has('9.9.9')) {
    throw new Error('Python SDK changelog version rows must recognize the released version');
  }
  if (previousVersionOnly.has('9.9.9')) {
    throw new Error(
      'Python SDK changelog version rows must not treat the previous version as released'
    );
  }
  for (const version of ['9.9.9rc1', '9.9.9.post1', '9.9.9.dev1']) {
    if (!pep440Versions.has(version)) {
      throw new Error(
        `Python SDK changelog version rows must recognize PEP 440 version ${version}`
      );
    }
  }
}

if (!tsReleaseWorkflow.includes('publish-script: pnpm changeset:release')) {
  throw new Error('ts.release.yml must use the repository-controlled changeset:release script');
}

if (packageJson.scripts?.['changeset:release'] !== 'bash ts/scripts/changeset-release.sh') {
  throw new Error('changeset:release must use the CLI-release filtering script');
}

if (packageJson.scripts?.['validate:changesets'] !== 'node ts/scripts/validate-changesets.mjs') {
  throw new Error('validate:changesets must use the ignored-package guard');
}

{
  const violations = findIgnoredChangesetReleases(
    {
      changesets: [
        {
          id: 'ignored-package-fixture',
          releases: [
            { name: '@composio/cli', type: 'patch' },
            { name: '@composio/core', type: 'patch' },
          ],
        },
      ],
    },
    ['@composio/cli']
  );

  if (
    violations.length !== 1 ||
    violations[0].changeset !== 'ignored-package-fixture' ||
    violations[0].package !== '@composio/cli'
  ) {
    throw new Error('changeset validation must identify releases targeting ignored packages');
  }
}

{
  const fixtureDir = mkdtempSync(join(tmpdir(), 'composio-changeset-validation-'));
  const changesetDir = join(fixtureDir, '.changeset');
  const fixturePath = join(changesetDir, 'ignored-package-fixture.md');

  try {
    mkdirSync(changesetDir, { recursive: true });
    writeFileSync(join(changesetDir, 'config.json'), JSON.stringify({ ignore: ['@composio/cli'] }));
    writeFileSync(
      fixturePath,
      '---\n"@composio/cli": patch\n"@composio/core": patch\n---\n\nFixture changeset.\n'
    );

    let validationError = '';
    try {
      await validateChangesets(fixtureDir);
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
    }

    if (!validationError.includes('ignored-package-fixture: @composio/cli')) {
      throw new Error('changeset validation must reject an ignored package outside a git checkout');
    }

    writeFileSync(fixturePath, '---\n"@composio/core": patch\n---\n\nValid fixture changeset.\n');
    await validateChangesets(fixtureDir);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

const validateChangesetsIdx = tsReleaseWorkflow.indexOf('run: pnpm validate:changesets');
const changesetsActionIdx = tsReleaseWorkflow.indexOf('uses: changesets/action@');
if (
  validateChangesetsIdx === -1 ||
  changesetsActionIdx === -1 ||
  validateChangesetsIdx > changesetsActionIdx
) {
  throw new Error('ts.release.yml must validate pending changesets before changesets/action');
}

if (!tsReleaseWorkflow.includes('changesets/action@8488615a623b1b9c987934bb89eae8af6a946ac1 # v2.1.1')) {
  throw new Error('ts.release.yml must use changesets/action v2 with Changesets v3');
}

for (const input of [
  'github-token: ${{ steps.app-token.outputs.token }}',
  'publish-script: pnpm changeset:release',
  "commit-message: 'Release: update version'",
  "pr-title: 'Release: update version'",
]) {
  if (!tsReleaseWorkflow.includes(input)) {
    throw new Error(`ts.release.yml must use the changesets/action v2 ${input} input`);
  }
}

if (!tsReleaseWorkflow.includes('steps.changesets.outputs.published-packages')) {
  throw new Error('ts.release.yml must read the changesets/action v2 published-packages output');
}

if (changesetConfig.baseBranch !== 'next') {
  throw new Error('changesets must compare against next, the active release branch');
}

if (
  changesetConfig.___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH
    ?.onlyUpdatePeerDependentsWhenOutOfRange !== true
) {
  throw new Error(
    'changesets must only major-bump peer dependents when the new dependency version leaves their declared peer range'
  );
}

{
  const MIN_NODE_VERSION = '>=22.22.3';
  const publicTsReleaseWorkspaces = readTypeScriptWorkspacePackages().filter(
    ({ manifest }) => manifest.private !== true
  );
  const invalidNodeEngines = publicTsReleaseWorkspaces.filter(
    ({ manifest }) => manifest.engines?.node !== MIN_NODE_VERSION
  );

  if (publicTsReleaseWorkspaces.length === 0) {
    throw new Error('Node.js engine validation must discover public TypeScript workspaces');
  }
  if (invalidNodeEngines.length > 0) {
    const details = invalidNodeEngines
      .map(({ manifest, path }) => `- ${path}: ${manifest.engines?.node ?? '<missing>'}`)
      .join('\n');
    throw new Error(
      `Public TypeScript workspaces must declare engines.node as ${MIN_NODE_VERSION}:\n${details}`
    );
  }
}

// --- Python release metadata: package version, runtime version, and docs changelog must agree ---

if (!pythonReleaseWorkflow.includes('run: pnpm test:release-workflow')) {
  throw new Error('py.release.yml must validate release metadata before publishing');
}

{
  const pythonVersion = readPyprojectVersion(pythonPyproject, 'python/pyproject.toml version');
  const runtimeVersion = requireMatch(
    pythonRuntimeVersionModule,
    /^\s*__version__\s*=\s*"([^"]+)"\s*$/m,
    'python/composio/__version__.py version'
  );

  if (runtimeVersion !== pythonVersion) {
    throw new Error(
      `python/composio/__version__.py must match python/pyproject.toml (${runtimeVersion} !== ${pythonVersion})`
    );
  }

  const documentedPythonVersions = readDocumentedSdkVersions('Python `composio`');
  if (!documentedPythonVersions.has(pythonVersion)) {
    throw new Error(
      `docs/content/changelog must document the current Python package version (${pythonVersion})`
    );
  }

  const providerDir = new URL('../python/providers/', import.meta.url);
  for (const entry of readdirSync(providerDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const pyprojectPath = new URL(
      `../python/providers/${entry.name}/pyproject.toml`,
      import.meta.url
    );
    const setupPath = new URL(`../python/providers/${entry.name}/setup.py`, import.meta.url);
    if (!existsSync(pyprojectPath)) continue;

    const providerPyprojectVersion = readPyprojectVersion(
      readFileSync(pyprojectPath, 'utf8'),
      `python/providers/${entry.name}/pyproject.toml version`
    );
    if (providerPyprojectVersion !== pythonVersion) {
      throw new Error(
        `python/providers/${entry.name}/pyproject.toml must match python/pyproject.toml (${providerPyprojectVersion} !== ${pythonVersion})`
      );
    }

    if (!existsSync(setupPath)) continue;

    const providerSetupVersion = requireMatch(
      readFileSync(setupPath, 'utf8'),
      /version\s*=\s*"([^"]+)"/,
      `python/providers/${entry.name}/setup.py version`
    );
    if (providerSetupVersion !== pythonVersion) {
      throw new Error(
        `python/providers/${entry.name}/setup.py must match python/pyproject.toml (${providerSetupVersion} !== ${pythonVersion})`
      );
    }
  }
}

{
  const documentedTsCoreVersions = readDocumentedSdkVersions('TypeScript `@composio/core`');
  if (!documentedTsCoreVersions.has(tsCorePackageJson.version)) {
    throw new Error(
      `docs/content/changelog must document the current TypeScript core package version (${tsCorePackageJson.version})`
    );
  }
}

if (!releaseScript.includes('pnpm changeset publish')) {
  throw new Error('release script must still publish non-CLI changeset packages');
}

if (!releaseScript.includes('CHANGESETS_OUTPUT')) {
  throw new Error(
    'release script must filter @composio/cli Changesets v3 output before changesets/action creates GitHub releases'
  );
}

// --- build-cli-binaries.yml: the CLI binary workflow is the sole, hardened release writer ---

const canonicalWindowsInstallGuidance = requireMatch(
  rootInstallGuide,
  /^(- Windows: .+)$/m,
  'canonical Windows install guidance'
);
const generatedInstallGuide = requireMatch(
  buildCliWorkflow,
  /cat > INSTALL\.md << 'EOF'\n([\s\S]*?)\n\s+EOF/,
  'generated CLI release INSTALL.md'
);
const generatedWindowsInstallGuidance = requireMatch(
  generatedInstallGuide,
  /^\s*(- Windows: .+)$/m,
  'generated Windows install guidance'
);

if (
  !canonicalWindowsInstallGuidance.includes(
    '[WSL](https://learn.microsoft.com/windows/wsl/install)'
  )
) {
  throw new Error('INSTALL.md must direct Windows users to the canonical WSL instructions');
}
if (generatedWindowsInstallGuidance !== canonicalWindowsInstallGuidance) {
  throw new Error(
    'build-cli-binaries.yml generated INSTALL.md must match the canonical Windows guidance'
  );
}

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
  throw new Error(
    'build-cli-binaries.yml must checkout workflow release helpers before publishing'
  );
}
if (!buildCliWorkflow.includes('ref: ${{ github.workflow_sha }}')) {
  throw new Error(
    'build-cli-binaries.yml must checkout release helpers from the workflow revision'
  );
}
if (draftStepIdx === -1) {
  throw new Error('build-cli-binaries.yml must create the draft via create-or-resume-draft.sh');
}
if (verifyStepIdx === -1) {
  throw new Error('build-cli-binaries.yml must verify assets via verify-assets.sh');
}
if (publishIdx === -1) {
  throw new Error(
    'build-cli-binaries.yml must publish by flipping the draft (gh release edit --draft=false)'
  );
}
if (!(
  helperCheckoutIdx < draftStepIdx &&
  draftStepIdx < verifyStepIdx &&
  verifyStepIdx < publishIdx
)) {
  throw new Error(
    'build-cli-binaries.yml must order steps helper checkout → draft → verify → publish'
  );
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
  throw new Error(
    'create-or-resume-draft.sh must preserve --prerelease on the draft for beta releases'
  );
}

// Skills must be packaged BEFORE checksums are generated, so composio-skill.zip is hashed into
// checksums.txt rather than shipping unverifiable.
const packageSkillsIdx = buildCliWorkflow.indexOf('name: Package skill files');
const generateChecksumsIdx = buildCliWorkflow.indexOf('name: Generate checksums');
if (packageSkillsIdx === -1 || generateChecksumsIdx === -1) {
  throw new Error('build-cli-binaries.yml must package skills and generate checksums');
}
if (!(packageSkillsIdx < generateChecksumsIdx)) {
  throw new Error(
    'build-cli-binaries.yml must package skills before generating checksums so the skill zip is checksummed'
  );
}

if (
  !generateChecksumsScript.includes("from './_teardown'") ||
  generateChecksumsScript.includes("from './_shared'")
) {
  throw new Error(
    'CLI checksum generation must use the dependency-light teardown without loading CLI runtime helpers'
  );
}

// The release job runs checksum generation in a fresh checkout where workspace packages have not
// been built. Exercise the script from an unrelated working directory to prevent imports from
// pulling in the CLI runtime and its unbuilt @composio/core dependency.
{
  const fixtureDir = mkdtempSync(join(tmpdir(), 'composio-cli-checksums-'));
  try {
    const binariesDir = join(fixtureDir, 'dist/binaries');
    mkdirSync(binariesDir, { recursive: true });
    writeFileSync(join(binariesDir, 'composio-linux-x64.zip'), 'release archive fixture\n');

    const result = spawnSync(process.execPath, [generateChecksumsScriptPath], {
      cwd: fixtureDir,
      encoding: 'utf8',
      env: process.env,
    });

    if (result.status !== 0) {
      throw new Error(
        `CLI checksum generation must run without built workspace packages\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }

    const checksums = readFileSync(join(binariesDir, 'checksums.txt'), 'utf8');
    if (!/^[a-f0-9]{64}  composio-linux-x64\.zip\n$/.test(checksums)) {
      throw new Error(`CLI checksum generation wrote an invalid manifest:\n${checksums}`);
    }
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

// Per-tag concurrency prevents two runs clobbering the same release without serializing betas.
if (!buildCliWorkflow.includes('group: cli-release-${{ needs.prepare.outputs.release_tag }}')) {
  throw new Error(
    'build-cli-binaries.yml release job must use per-tag concurrency keyed on the release tag'
  );
}

// Release-target resolution lives in a standalone, unit-tested script (see executable tests
// below) rather than inline YAML bash, so the branching logic is reviewable and testable.
if (!buildCliWorkflow.includes('bash .github/scripts/cli-release/resolve-release-target.sh')) {
  throw new Error('build-cli-binaries.yml prepare job must delegate to resolve-release-target.sh');
}

// Release archives contain a composio-<target>/ bundle with runtime support files next to the
// executable. Both the checked-in guide and the workflow-generated guide must preserve that
// directory contents and create the same two-directory layout as the installer.
const manualInstallGuides = [
  {
    label: 'INSTALL.md',
    source: requireMatch(
      installGuide,
      /## Manual Installation([\s\S]*?)## Verification/,
      'INSTALL.md manual installation section'
    ),
  },
  {
    label: 'build-cli-binaries.yml generated INSTALL.md',
    source: requireMatch(
      buildCliWorkflow,
      /## Manual Installation([\s\S]*?)## Usage/,
      'generated INSTALL.md manual installation section'
    ),
  },
];

for (const guide of manualInstallGuides) {
  if (!guide.source.includes('cp -Rp "$bundle"/. "$COMPOSIO_INSTALL_DIR/"')) {
    throw new Error(`${guide.label} must install the complete CLI release bundle`);
  }
  if (!guide.source.includes('mkdir -p "$COMPOSIO_BIN_DIR"')) {
    throw new Error(`${guide.label} must create the CLI entry-point directory`);
  }
  if (
    !guide.source.includes('ln -sf "$COMPOSIO_INSTALL_DIR/composio" "$COMPOSIO_BIN_DIR/composio"')
  ) {
    throw new Error(`${guide.label} must link the CLI entry point to the release bundle`);
  }
}

// The "latest stable" lookup must sort by numeric semver, not lexically: a lexical sort ranks
// @composio/cli@0.2.9 above 0.2.10 and would regress beta versioning once a patch hits 2 digits.
if (!resolveTargetScript.includes('map(tonumber)')) {
  throw new Error(
    'resolve-release-target.sh must sort releases by numeric semver (map(tonumber)), not lexically'
  );
}
if (!resolveTargetScript.includes('--exclude-drafts')) {
  throw new Error(
    'resolve-release-target.sh must exclude draft stable releases from beta base selection'
  );
}
if (!buildCliWorkflow.includes('RELEASE_TAG: ${{ needs.prepare.outputs.release_tag }}')) {
  throw new Error('CLI binary builds must receive the resolved GitHub release tag');
}
if (
  !buildAllCliBinariesScript.includes(
    '...buildCliReleaseVersionDefineArgs(process.env.RELEASE_TAG)'
  )
) {
  throw new Error('the all-target CLI build must embed the resolved GitHub release version');
}
if (
  !buildCliWorkflow.includes(
    "- name: Verify binary version\n        if: matrix.target == 'bun-linux-x64'"
  )
) {
  throw new Error('CLI binary version verification must run only on a native target');
}
if (!buildCliWorkflow.includes('expected_version#@composio/cli@')) {
  throw new Error('CLI binary version verification must strip the release tag prefix');
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
  throw new Error(
    'cli.install-health-check.yml must not pin to npm (races ahead of the GitHub release)'
  );
}
if (!installHealthCheck.includes('gh release list')) {
  throw new Error(
    'cli.install-health-check.yml must resolve the newest published release (drafts excluded)'
  );
}
if (!installHealthCheck.includes('--repo "${{ github.repository }}"')) {
  throw new Error('cli.install-health-check.yml must pass repository context to gh release list');
}
if (!installHealthCheck.includes('--limit 1000')) {
  throw new Error(
    'cli.install-health-check.yml must look beyond the gh release list default limit'
  );
}
if (
  !installHealthCheck.includes('--exclude-drafts') ||
  !installHealthCheck.includes('--exclude-pre-releases')
) {
  throw new Error(
    'cli.install-health-check.yml must resolve the newest published release (drafts excluded)'
  );
}
if (installHealthCheck.includes('.[0].tagName')) {
  throw new Error('cli.install-health-check.yml must not let jq null bypass the empty tag guard');
}
if (!installHealthCheck.includes("| sed -n '1p'")) {
  throw new Error(
    'cli.install-health-check.yml must convert no matching release into empty output'
  );
}
if (!installHealthCheck.includes('sh -s -- "${{ steps.resolve.outputs.tag }}"')) {
  throw new Error('cli.install-health-check.yml must install the resolved tag via the pinned path');
}
if (!installHealthCheck.includes('echo "$HOME/.local/bin" >> "$GITHUB_PATH"')) {
  throw new Error('cli.install-health-check.yml must expose the installer entry-point directory');
}
if (!installHealthCheck.includes('test -L "$HOME/.local/bin/composio"')) {
  throw new Error('cli.install-health-check.yml must verify the installer entry-point symlink');
}
if (installHealthCheck.includes('rm -rf "$HOME/.composio"')) {
  throw new Error('cli.install-health-check.yml must preserve CLI user state between install legs');
}

// --- uninstall file lists: the hand-maintained copies must stay in sync ---

// The uninstall file list mirrors the release bundle layout and is duplicated in INSTALL.md,
// docs/content/docs/cli.mdx, and cli.install-health-check.yml. Drift between them ships
// uninstall guidance (or a health-check reset) that leaves release artifacts behind.
function readUninstallEntries(source, command, label) {
  const block = requireMatch(
    source,
    new RegExp(`${command} \\\\\\n((?:[ \\t]*"[^"]+"(?: \\\\)?\\n)+)`),
    `${label} ${command} uninstall block`
  );
  return [...block.matchAll(/"([^"]+)"/g)].map(entry =>
    entry[1]
      .replace(/^\$install_dir\//, '')
      .replace(/^\$bin_dir\//, '')
      .replace(/^\$HOME\/\.composio\//, '')
      .replace(/^\$HOME\/\.local\/bin\//, '')
  );
}

const uninstallGuides = [
  { label: 'INSTALL.md', source: installGuide },
  { label: 'docs/content/docs/cli.mdx', source: cliDocsGuide },
  { label: 'cli.install-health-check.yml', source: installHealthCheck },
].map(({ label, source }) => ({
  label,
  files: readUninstallEntries(source, 'rm -f', label),
  directories: readUninstallEntries(source, 'rm -rf', label),
}));

const [canonicalUninstall, ...mirroredUninstallGuides] = uninstallGuides;

// Guard the parser itself: a mis-anchored match must not pass vacuously.
if (
  !canonicalUninstall.files.includes('run-helpers-runtime.mjs') ||
  !canonicalUninstall.directories.includes('services')
) {
  throw new Error('INSTALL.md uninstall list must cover the release bundle layout');
}

for (const guide of mirroredUninstallGuides) {
  if (JSON.stringify(guide.files) !== JSON.stringify(canonicalUninstall.files)) {
    throw new Error(
      `${guide.label} uninstall file list drifted from INSTALL.md:\n` +
        `  ${guide.label}: ${JSON.stringify(guide.files)}\n` +
        `  INSTALL.md: ${JSON.stringify(canonicalUninstall.files)}`
    );
  }
  if (JSON.stringify(guide.directories) !== JSON.stringify(canonicalUninstall.directories)) {
    throw new Error(
      `${guide.label} uninstall directory list drifted from INSTALL.md:\n` +
        `  ${guide.label}: ${JSON.stringify(guide.directories)}\n` +
        `  INSTALL.md: ${JSON.stringify(canonicalUninstall.directories)}`
    );
  }
}

const fakeBin = mkdtempSync(join(tmpdir(), 'composio-release-test-'));
try {
  const fakePnpmPath = join(fakeBin, 'pnpm');
  const changesetsOutputPath = join(fakeBin, 'changesets-output.ndjson');
  writeFileSync(
    fakePnpmPath,
    `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "run build:packages")
    exit 0
    ;;
  "changeset publish")
    printf '%s\\n' '{"type":"git-tag","tag":"@composio/core@1.2.3","packageName":"@composio/core"}' > "$CHANGESETS_OUTPUT"
    printf '%s\\n' '{"type":"git-tag","tag":"@composio/cli@9.9.9","packageName":"@composio/cli"}' >> "$CHANGESETS_OUTPUT"
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
    env: {
      ...process.env,
      CHANGESETS_OUTPUT: changesetsOutputPath,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
  });

  if (result.status !== 0) {
    throw new Error(
      `release script failed unexpectedly\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const outputEvents = readFileSync(changesetsOutputPath, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  if (
    outputEvents.length !== 1 ||
    outputEvents[0].packageName !== '@composio/core' ||
    outputEvents[0].tag !== '@composio/core@1.2.3'
  ) {
    throw new Error('release script must retain only non-CLI Changesets v3 git-tag events');
  }

  if (!result.stderr.includes('release warning preserved')) {
    throw new Error('release script must preserve changeset publish stderr');
  }
} finally {
  rmSync(fakeBin, { recursive: true, force: true });
}

// A core minor release must not force every provider package to 1.0.0 while the
// provider peer range still accepts the new core version. This protects the
// @composio/core 0.10.0 → 0.11.0 release train from accidentally promoting
// provider packages from 0.9.x to 1.0.0.
{
  const fixtureDir = mkdtempSync(join(tmpdir(), 'composio-changeset-peer-'));
  try {
    mkdirSync(join(fixtureDir, '.changeset'), { recursive: true });
    mkdirSync(join(fixtureDir, 'packages/core'), { recursive: true });
    mkdirSync(join(fixtureDir, 'packages/openai'), { recursive: true });

    writeFileSync(
      join(fixtureDir, 'package.json'),
      JSON.stringify(
        {
          name: 'changeset-peer-fixture',
          private: true,
          workspaces: ['packages/*'],
        },
        null,
        2
      )
    );
    writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeFileSync(
      join(fixtureDir, '.changeset/config.json'),
      JSON.stringify(
        {
          changelog: false,
          commit: false,
          fixed: [],
          linked: [],
          access: 'restricted',
          baseBranch: 'next',
          updateInternalDependencies: 'patch',
          ___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH: {
            onlyUpdatePeerDependentsWhenOutOfRange: true,
          },
          ignore: [],
        },
        null,
        2
      )
    );
    writeFileSync(
      join(fixtureDir, '.changeset/core-minor-provider-patch.md'),
      [
        '---',
        '"@composio/core": minor',
        '"@composio/openai": patch',
        '---',
        '',
        'Release a core minor and a provider patch without forcing a provider major.',
        '',
      ].join('\n')
    );
    writeFileSync(
      join(fixtureDir, 'packages/core/package.json'),
      JSON.stringify(
        {
          name: '@composio/core',
          version: '0.10.0',
        },
        null,
        2
      )
    );
    writeFileSync(
      join(fixtureDir, 'packages/openai/package.json'),
      JSON.stringify(
        {
          name: '@composio/openai',
          version: '0.9.2',
          peerDependencies: {
            '@composio/core': '>=0.10.0 <1.0.0',
          },
          devDependencies: {
            '@composio/core': 'workspace:*',
          },
        },
        null,
        2
      )
    );

    const result = spawnSync(changesetBinPath, ['version'], {
      cwd: fixtureDir,
      encoding: 'utf8',
      env: process.env,
    });

    if (result.status !== 0) {
      throw new Error(
        `changeset peer-dependent fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }

    const coreFixturePackage = JSON.parse(
      readFileSync(join(fixtureDir, 'packages/core/package.json'), 'utf8')
    );
    const providerFixturePackage = JSON.parse(
      readFileSync(join(fixtureDir, 'packages/openai/package.json'), 'utf8')
    );

    if (coreFixturePackage.version !== '0.11.0') {
      throw new Error(`fixture core version should be 0.11.0, got ${coreFixturePackage.version}`);
    }
    if (providerFixturePackage.version !== '0.9.3') {
      throw new Error(
        `fixture provider version should remain on the 0.9.x train as 0.9.3, got ${providerFixturePackage.version}`
      );
    }
    if (providerFixturePackage.peerDependencies['@composio/core'] !== '>=0.10.0 <1.0.0') {
      throw new Error(
        `fixture provider peer range should still accept core 0.11.0 without widening, got ${providerFixturePackage.peerDependencies['@composio/core']}`
      );
    }
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
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
    for (const [name, body] of [
      ['gh', FAKE_GH],
      ['curl', FAKE_CURL],
    ]) {
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

// Pushes to next are always betas, regardless of private package metadata.
{
  const r = runResolver({
    env: {
      EVENT_NAME: 'push',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '43',
      COMMIT_SHA: 'deadbeef',
    },
    releasesFixture: [{ tagName: '@composio/cli@0.2.33', isPrerelease: false }],
  });
  if (r.status !== 0) {
    throw new Error(`resolve-release-target.sh push failed\nstderr:\n${r.stderr}`);
  }
  if (r.outputs.release_tag !== '@composio/cli@0.2.34-beta.43') {
    throw new Error(`push must produce the next rolling beta, got ${r.outputs.release_tag}`);
  }
  if (r.outputs.prerelease !== 'true') {
    throw new Error('push must never publish a stable release directly');
  }
}

// Release owners can choose an intentional minor/major base without changing package.json.
{
  const r = runResolver({
    env: {
      EVENT_NAME: 'workflow_dispatch',
      ACTION_INPUT: 'build-beta',
      VERSION_INPUT: '0.3.0',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '44',
      COMMIT_SHA: 'deadbeef',
    },
    releasesFixture: [{ tagName: '@composio/cli@0.2.33', isPrerelease: false }],
  });
  if (r.status !== 0) {
    throw new Error(`explicitly versioned build-beta failed\nstderr:\n${r.stderr}`);
  }
  if (r.outputs.release_tag !== '@composio/cli@0.3.0-beta.44') {
    throw new Error(`explicit build-beta version was not honored: ${r.outputs.release_tag}`);
  }
}

{
  const r = runResolver({
    env: {
      EVENT_NAME: 'workflow_dispatch',
      ACTION_INPUT: 'build-beta',
      VERSION_INPUT: '0.2.33',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '45',
      COMMIT_SHA: 'deadbeef',
    },
    releasesFixture: [{ tagName: '@composio/cli@0.2.33', isPrerelease: false }],
  });
  if (r.status === 0 || !r.stderr.includes('must be newer than latest stable')) {
    throw new Error('build-beta must reject an explicit version at or below latest stable');
  }
}

{
  const r = runResolver({
    env: {
      EVENT_NAME: 'workflow_dispatch',
      ACTION_INPUT: 'build-beta',
      VERSION_INPUT: 'next',
      REPOSITORY: 'ComposioHQ/composio',
      RUN_NUMBER: '46',
      COMMIT_SHA: 'deadbeef',
    },
  });
  if (r.status === 0 || !r.stderr.includes('Beta version must match')) {
    throw new Error('build-beta must reject a non-semver explicit version');
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
    throw new Error(
      `promote-stable must check out the beta's target_commitish, got ${r.outputs.checkout_ref}`
    );
  }
}

console.log('release workflow test passed');
