import { afterEach, expect, test } from 'bun:test';
import { spawn } from '../scripts/sdk-release/runtime';
import {
  readText,
  resolvePath,
  runRelease,
  temporaryDirectories,
  writeText,
} from './sdk-release-harness';

const directories = temporaryDirectories('sdk-candidate-retry-');
afterEach(() => directories.cleanup());

test('a transient artifact-list failure leaves the original candidate retryable', async () => {
  const directory = await directories.create();
  await writeText(
    `${directory}/.github/sdk-release-plan.json`,
    JSON.stringify({
      schemaVersion: 1,
      id: '8',
      originalRunId: '8',
      inputBase: 'a'.repeat(40),
      statusUrl: 'https://github.com/ComposioHQ/composio/issues/8',
      date: '2026-11-03',
      outputs: [],
      plan: {
        schemaVersion: 1,
        inputFingerprint: 'frozen',
        choices: { typescript: 'auto', python: 'skip' },
        recommended: [],
        changesets: [],
        retainedChangesets: [],
        releases: [
          {
            name: '@composio/core',
            oldVersion: '1.0.0',
            newVersion: '1.0.1',
            type: 'patch',
            changesets: [],
            language: 'typescript',
          },
        ],
      },
    })
  );
  const preload = `${directory}/fetch.ts`;
  await writeText(preload, 'globalThis.fetch = async () => new Response("{}", { status: 502 });\n');
  const output = `${directory}/output`;
  await writeText(output, '');
  const script = await resolvePath('scripts/sdk-release/candidates.ts');
  const result = await runRelease(
    spawn('bun', ['--preload', preload, script, 'typescript'], {
      cwd: directory,
      env: {
        GITHUB_RUN_ID: '9',
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_SHA: 'b'.repeat(40),
        GITHUB_REF: 'refs/pull/9/merge',
        GITHUB_OUTPUT: output,
        SDK_READ_TOKEN: 'fixture',
        SDK_RELEASE_TOKEN: '',
      },
    })
  );
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain('failed (502)');
  expect(await readText(output)).not.toContain('terminal=true');
});
