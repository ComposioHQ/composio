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
