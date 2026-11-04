import { afterAll, expect, test } from 'bun:test';
import { adoptApprovedCandidate } from '../scripts/sdk-release/candidates';
import { formatJson, run, sha256Hex } from '../scripts/sdk-release/runtime';
import {
  json,
  readText,
  runRelease,
  temporaryDirectories,
  writeText,
  type Fetch,
} from './sdk-release-harness';

const directories = temporaryDirectories('sdk-approved-candidate-');
afterAll(() => directories.cleanup());

const head = 'a'.repeat(40);
const wheel = 'composio-1.0.1-py3-none-any.whl';
const wheelText = 'approved wheel bytes';

/** A real candidate archive as the release-PR run uploaded it; `listed` is the manifest's text. */
const approvedArchive = async (listed = wheelText) => {
  const directory = await directories.create();
  const listedBytes = new TextEncoder().encode(listed);
  await writeText(`${directory}/${wheel}`, wheelText);
  await writeText(
    `${directory}/candidate.json`,
    formatJson({
      sourceSha: head,
      producerRun: 41,
      language: 'python',
      files: [
        { name: wheel, sha256: await runRelease(sha256Hex(listedBytes)), size: listedBytes.length },
      ],
    })
  );
  const zip = `${directory}/candidate.zip`;
  await runRelease(
    run('zip', ['-j', '-q', zip, `${directory}/${wheel}`, `${directory}/candidate.json`])
  );
  const bytes = new Uint8Array(await Bun.file(zip).arrayBuffer());
  return { bytes, digest: `sha256:${await runRelease(sha256Hex(bytes))}` };
};

const releaseRun = (id: number, conclusion = 'success') => ({
  id,
  path: '.github/workflows/sdk.release.candidates.yml',
  head_branch: 'sdk-release/batch-8',
  head_sha: head,
  event: 'pull_request',
  repository: { full_name: 'ComposioHQ/composio' },
  status: 'completed',
  conclusion,
  created_at: '2026-11-03T00:00:00Z',
  run_attempt: 1,
  html_url: `https://github.com/ComposioHQ/composio/actions/runs/${id}`,
});

const fakeGitHub =
  (
    archive: { bytes: Uint8Array<ArrayBuffer>; digest: string },
    runs: unknown[],
    expired = false
  ): Fetch =>
  async input => {
    const url = new URL(String(input));
    if (url.hostname === 'artifacts.test') return new Response(archive.bytes);
    const path = url.pathname.replace('/repos/ComposioHQ/composio', '');
    if (path === '/actions/workflows/sdk.release.candidates.yml/runs')
      return json({ workflow_runs: runs });
    if (path === '/actions/runs/41/artifacts')
      return json({
        artifacts: [
          {
            id: 77,
            name: 'sdk-candidate-python',
            digest: archive.digest,
            expired,
            created_at: '2026-11-03T00:00:00Z',
            expires_at: '2099-12-01T00:00:00Z',
            workflow_run: { id: 41, head_sha: head },
          },
        ],
      });
    if (path === '/actions/artifacts/77/zip')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://artifacts.test/77.zip' },
      });
    throw new Error(`Unexpected read ${path}`);
  };

test('a source-tag run copies the newest approved release-PR candidate byte for byte', async () => {
  const archive = await approvedArchive();
  const target = `${await directories.create()}/python`;
  const approved = await runRelease(
    adoptApprovedCandidate(head, 'python', target),
    fakeGitHub(archive, [releaseRun(40), releaseRun(41), releaseRun(42, 'failure')])
  );
  expect(approved).toEqual({ run: 41, artifactId: 77, digest: archive.digest });
  expect(await readText(`${target}/${wheel}`)).toBe(wheelText);
  expect(await Bun.file(`${target}/candidate.json`).exists()).toBe(false);
});

test('approved files that differ from their recorded checksums are not adopted', async () => {
  const archive = await approvedArchive('different wheel bytes');
  const target = `${await directories.create()}/python`;
  await expect(
    runRelease(
      adoptApprovedCandidate(head, 'python', target),
      fakeGitHub(archive, [releaseRun(41)])
    )
  ).rejects.toThrow(`Candidate checksum mismatch: ${wheel}`);
});

test('a head without a successful release-PR run points the operator to supersede', async () => {
  const archive = await approvedArchive();
  const target = `${await directories.create()}/python`;
  await expect(
    runRelease(
      adoptApprovedCandidate(head, 'python', target),
      fakeGitHub(archive, [releaseRun(41, 'failure')])
    )
  ).rejects.toThrow(
    'No successful release-PR run built the approved python candidate; request a new release with supersede'
  );
});

test('an expired approved candidate points the operator to supersede', async () => {
  const archive = await approvedArchive();
  const target = `${await directories.create()}/python`;
  await expect(
    runRelease(
      adoptApprovedCandidate(head, 'python', target),
      fakeGitHub(archive, [releaseRun(41)], true)
    )
  ).rejects.toThrow('Original candidate unavailable; request a new release with supersede');
});
