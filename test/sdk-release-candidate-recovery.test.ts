import { afterEach, expect, test } from 'bun:test';
import { formatJson, run, sha256Hex, spawn } from '../scripts/sdk-release/runtime';
import {
  readText,
  resolvePath,
  runRelease,
  temporaryDirectories,
  writeText,
} from './sdk-release-harness';

const directories = temporaryDirectories('sdk-candidate-copy-');
afterEach(() => directories.cleanup());

const head = 'b'.repeat(40);
const tarball = 'composio-core-1.0.1.tgz';

/** The archive release-PR run 41 uploaded for `@composio/core@1.0.1`. */
const approvedArchive = async () => {
  const directory = await directories.create();
  const bytes = new TextEncoder().encode('approved tarball bytes');
  await writeText(`${directory}/${tarball}`, 'approved tarball bytes');
  await writeText(
    `${directory}/candidate.json`,
    formatJson({
      sourceSha: head,
      producerRun: 41,
      language: 'typescript',
      files: [{ name: tarball, sha256: await runRelease(sha256Hex(bytes)), size: bytes.length }],
    })
  );
  const zip = `${directory}/candidate.zip`;
  await runRelease(
    run('zip', ['-j', '-q', zip, `${directory}/${tarball}`, `${directory}/candidate.json`])
  );
  const archive = new Uint8Array(await Bun.file(zip).arrayBuffer());
  return { zip, digest: `sha256:${await runRelease(sha256Hex(archive))}` };
};

/** One attempt of the tag run's copy job, on a fresh runner, for tag run 9. */
const copyAttempt = async (archive: { zip: string; digest: string }, attempt: number) => {
  const directory = await directories.create();
  await writeText(`${directory}/package.json`, JSON.stringify({ name: 'root', private: true }));
  await writeText(`${directory}/pnpm-workspace.yaml`, "packages: ['core']\n");
  await writeText(
    `${directory}/core/package.json`,
    JSON.stringify({ name: '@composio/core', version: '1.0.1' })
  );
  await writeText(
    `${directory}/.github/sdk-release-plan.json`,
    JSON.stringify({
      schemaVersion: 1,
      id: '8',
      originalRunId: '8',
      requestedBy: ['requester'],
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
  const routes = {
    '/actions/workflows/sdk.release.candidates.yml/runs': {
      workflow_runs: [
        {
          id: 41,
          path: '.github/workflows/sdk.release.candidates.yml',
          head_branch: 'sdk-release/batch-8',
          head_sha: head,
          event: 'pull_request',
          repository: { full_name: 'ComposioHQ/composio' },
          status: 'completed',
          conclusion: 'success',
          created_at: '2026-11-03T00:00:00Z',
          run_attempt: 1,
          html_url: 'https://github.com/ComposioHQ/composio/actions/runs/41',
        },
      ],
    },
    '/actions/runs/41/jobs': {
      jobs: [
        {
          name: 'SDK candidate (typescript)',
          status: 'completed',
          conclusion: 'success',
          completed_at: '2026-11-03T00:10:00Z',
        },
      ],
    },
    '/actions/runs/41/artifacts': {
      artifacts: [
        {
          id: 77,
          name: 'sdk-candidate-typescript',
          digest: archive.digest,
          expired: false,
          created_at: '2026-11-03T00:00:00Z',
          expires_at: '2099-12-01T00:00:00Z',
          workflow_run: { id: 41, head_sha: head },
        },
      ],
    },
  };
  const preload = `${directory}/fetch.ts`;
  await writeText(
    preload,
    `const routes = ${JSON.stringify(routes)};
globalThis.fetch = async input => {
  const url = new URL(String(input));
  if (url.hostname === 'artifacts.test') return new Response(Bun.file(${JSON.stringify(archive.zip)}));
  if (url.pathname.endsWith('/actions/artifacts/77/zip'))
    return new Response(null, { status: 302, headers: { location: 'https://artifacts.test/77.zip' } });
  const route = Object.keys(routes).find(key => url.pathname.endsWith(key));
  return route ? Response.json(routes[route]) : new Response('{}', { status: 502 });
};
`
  );
  const output = `${directory}/output`;
  await writeText(output, '');
  const result = await runRelease(
    spawn(
      'bun',
      ['--preload', preload, await resolvePath('scripts/sdk-release/candidates.ts'), 'typescript'],
      {
        cwd: directory,
        env: {
          GITHUB_RUN_ID: '9',
          GITHUB_RUN_ATTEMPT: String(attempt),
          GITHUB_SHA: head,
          GITHUB_REF: 'refs/tags/sdk-release/8',
          GITHUB_OUTPUT: output,
          SDK_READ_TOKEN: 'fixture',
          SDK_RELEASE_TOKEN: '',
        },
      }
    )
  );
  expect({ exitCode: result.exitCode, stderr: result.stderr }).toMatchObject({ exitCode: 0 });
  return {
    manifest: await readText(`${directory}/sdk-candidate/typescript/candidate.json`),
    tarball: await readText(`${directory}/sdk-candidate/typescript/${tarball}`),
  };
};

test('a re-run of the tag-run copy produces an identical manifest', async () => {
  const archive = await approvedArchive();
  const first = await copyAttempt(archive, 1);
  const rerun = await copyAttempt(archive, 2);
  expect(first.tarball).toBe('approved tarball bytes');
  expect(JSON.parse(first.manifest)).toMatchObject({
    sourceSha: head,
    producerRun: 9,
    language: 'typescript',
    approvedFrom: { run: 41, artifactId: 77, digest: archive.digest },
  });
  expect(rerun.manifest).toBe(first.manifest);
});
