/**
 * CLI upgrade command e2e test
 *
 * Verifies that the compiled Linux binary can replace its running executable.
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { beforeAll, describe, expect, it } from 'bun:test';

const companionRelativePaths = [
  // RUN_COMPANION_MODULE_FILENAMES
  'run-helpers-runtime.mjs',
  'run-subagent-shared.mjs',
  'run-subagent-acp.mjs',
  'run-subagent-legacy.mjs',
  'run-subagent-output-mcp.mjs',
  // RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS
  'acp-adapters/claude-code-acp.mjs',
  'acp-adapters/cli.js',
  'acp-adapters/codex/darwin-arm64/codex-acp',
  'acp-adapters/codex/darwin-x64/codex-acp',
  'acp-adapters/codex/linux-arm64/codex-acp',
  'acp-adapters/codex/linux-x64/codex-acp',
] as const;

const sourceBundleSetup = companionRelativePaths
  .map(
    relativePath =>
      `mkdir -p "$(dirname "$source_dir/${relativePath}")"\n: > "$source_dir/${relativePath}"`
  )
  .join('\n');

const upgradeCommand = ({
  executablePath,
  copyExecutable,
}: {
  executablePath: string;
  copyExecutable: boolean;
}) => `
set -u
executable_path=${executablePath}
source_dir=/tmp/composio-upgrade-source
mkdir -p "$source_dir"
${copyExecutable ? 'mkdir -p "$(dirname "$executable_path")"\ncp /usr/local/bin/composio "$executable_path"' : ''}
cp /usr/local/bin/composio "$source_dir/composio"
${sourceBundleSetup}

before_inode=$(stat -c '%i' "$executable_path")
upgrade_status=0
DEBUG_OVERRIDE_UPGRADE_TARGET="$source_dir/composio" "$executable_path" upgrade || upgrade_status=$?
after_inode=$(stat -c '%i' "$executable_path" 2>/dev/null)

if [ -x "$executable_path" ]; then
  executable_status=0
else
  executable_status=1
fi

version_output=$("$executable_path" version)
version_status=$?
printf 'before_inode=%s\nafter_inode=%s\nupgrade_status=%s\nexecutable_status=%s\nversion_status=%s\nversion=%s\n' \
  "$before_inode" "$after_inode" "$upgrade_status" "$executable_status" "$version_status" "$version_output"

if [ "$upgrade_status" -eq 0 ] &&
  [ "$executable_status" -eq 0 ] &&
  [ "$version_status" -eq 0 ] &&
  [ -n "$before_inode" ] &&
  [ -n "$after_inode" ] &&
  [ "$before_inode" != "$after_inode" ]; then
  exit 0
fi
exit 1
`;

const outputField = (result: E2ETestResult, name: string): string => {
  const match = result.stdout.match(new RegExp(`^${name}=(.*)$`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
};

const expectAtomicUpgrade = (result: E2ETestResult) => {
  expect(result.exitCode).toBe(0);
  expect(result.stderr).not.toMatch(/ETXTBSY|text[ -]file(?: is)?[ -]busy/i);
  expect(outputField(result, 'upgrade_status')).toBe('0');
  expect(outputField(result, 'executable_status')).toBe('0');
  expect(outputField(result, 'version_status')).toBe('0');
  expect(outputField(result, 'version')).toMatch(/\d+\.\d+\.\d+/);
  expect(outputField(result, 'after_inode')).not.toBe(outputField(result, 'before_inode'));
};

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let installedResult: E2ETestResult;
    let copiedResult: E2ETestResult;

    beforeAll(async () => {
      installedResult = await runCmd(
        upgradeCommand({ executablePath: '/usr/local/bin/composio', copyExecutable: false })
      );
      copiedResult = await runCmd(
        upgradeCommand({ executablePath: '/tmp/composio-copy/composio', copyExecutable: true })
      );
    }, TIMEOUTS.FIXTURE);

    describe('composio upgrade', () => {
      it('replaces the running installed executable', () => {
        expectAtomicUpgrade(installedResult);
      });

      it('replaces an executable running from a copied path', () => {
        expectAtomicUpgrade(copiedResult);
      });
    });
  },
});
