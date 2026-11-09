import { afterEach, expect, test } from 'bun:test';
import { formatJson, run, sha256Hex, spawn } from '../scripts/sdk-release/runtime';
import {
  readText,
  resolvePath,
  runRelease,
  temporaryDirectories,
  writeText,
} from './sdk-release-harness';
import { batch, candidateRoutes, head } from './sdk-release-controller-fixture';

const directories = temporaryDirectories('sdk-candidate-pin-');
afterEach(() => directories.cleanup());

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

/** The tag run's pinning job for tag run 9, run as the CLI on a fresh checkout. */
const pinAttempt = async (
  archive: { zip: string; digest: string },
  options: { expired?: boolean; headAuthor?: string } = {}
) => {
  const directory = await directories.create();
  await writeText(`${directory}/package.json`, JSON.stringify({ name: 'root', private: true }));
  await writeText(`${directory}/pnpm-workspace.yaml`, "packages: ['core']\n");
  await writeText(
    `${directory}/core/package.json`,
    JSON.stringify({ name: '@composio/core', version: '1.0.1' })
  );
  await writeText(`${directory}/.github/sdk-release-plan.json`, JSON.stringify(batch));
  const routes = candidateRoutes(archive.digest, options);
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
  const summary = `${directory}/summary`;
  await writeText(summary, '');
  const result = await runRelease(
    spawn(
      'bun',
      ['--preload', preload, await resolvePath('scripts/sdk-release/candidates.ts'), 'approve'],
      {
        cwd: directory,
        env: {
          GITHUB_RUN_ID: '9',
          GITHUB_SHA: head,
          GITHUB_REF: 'refs/tags/sdk-release/8',
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
          SDK_READ_TOKEN: 'fixture',
          SDK_RELEASE_APP_SLUG: 'sdk-release-app',
          SDK_RELEASE_TOKEN: '',
        },
      }
    )
  );
  return {
    exitCode: result.exitCode,
    stderr: result.stderr,
    output: await readText(output),
    tarball: () => readText(`${directory}/sdk-candidate/typescript/${tarball}`),
  };
};

test('the tag run pins the approved release-PR artifact and its languages as job outputs', async () => {
  const archive = await approvedArchive();
  const pinned = await pinAttempt(archive);
  expect({ exitCode: pinned.exitCode, stderr: pinned.stderr }).toMatchObject({ exitCode: 0 });
  expect(await pinned.tarball()).toBe('approved tarball bytes');
  expect(pinned.output).toBe(
    [
      'issue=8',
      `approved=${JSON.stringify({ typescript: { run: 41, artifactId: 77, digest: archive.digest } })}`,
      'typescript=true',
      'python=false',
      '',
    ].join('\n')
  );
});

test('a failed adoption still names the request issue, so the publish status reaches it', async () => {
  const pinned = await pinAttempt(await approvedArchive(), { expired: true });
  expect(pinned.exitCode).not.toBe(0);
  expect(pinned.output).toBe('issue=8\n');
});

test('a release tag on a commit the App did not make names no issue for the bot to write to', async () => {
  const pinned = await pinAttempt(await approvedArchive(), { expired: true, headAuthor: 'writer' });
  expect(pinned.exitCode).not.toBe(0);
  expect(pinned.output).toBe('');
});
