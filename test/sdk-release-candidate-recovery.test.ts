import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('a transient artifact-list failure leaves the original candidate retryable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-candidate-retry-'));
  try {
    await mkdir(join(directory, '.github'));
    await writeFile(
      join(directory, '.github/sdk-release-plan.json'),
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
    const preload = join(directory, 'fetch.ts');
    await writeFile(
      preload,
      'globalThis.fetch = async () => new Response("{}", { status: 502 });\n'
    );
    const output = join(directory, 'output');
    await writeFile(output, '');
    const result = spawnSync(
      process.execPath,
      [
        '--preload',
        preload,
        fileURLToPath(new URL('../scripts/sdk-release/candidates.ts', import.meta.url)),
        'typescript',
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_RUN_ID: '9',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_SHA: 'b'.repeat(40),
          GITHUB_OUTPUT: output,
          SDK_READ_TOKEN: 'fixture',
          SDK_RELEASE_TOKEN: '',
        },
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('failed (502)');
    expect(await readFile(output, 'utf8')).not.toContain('terminal=true');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
