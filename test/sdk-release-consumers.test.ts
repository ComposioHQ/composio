import { afterEach, describe, expect, test } from 'bun:test';
import {
  checkStrictConsumer,
  npmInstallArgs,
  pythonRequirement,
  verifyPublishedProviders,
} from '../scripts/sdk-release/consumers';
import {
  makeExecutable,
  readText,
  resolvePath,
  runRelease,
  symlink,
  temporaryDirectories,
  writeText,
} from './sdk-release-harness';
import { run, withoutReleaseTokens } from '../scripts/sdk-release/runtime';

const directories = temporaryDirectories('sdk-consumer-');
afterEach(directories.cleanup);

const release = (name: string, newVersion: string) => ({ name, newVersion });

describe('candidate package source', () => {
  test('SDK packages install from candidate files, never by registry name', () => {
    const args = npmInstallArgs(
      '/work/sdk-candidate/typescript',
      [release('@composio/core', '1.2.3'), release('@composio/openai', '2.0.0')],
      ['typescript@5.9.3']
    );
    expect(args).toContain('/work/sdk-candidate/typescript/composio-core-1.2.3.tgz');
    expect(args).toContain('/work/sdk-candidate/typescript/composio-openai-2.0.0.tgz');
    expect(args.filter(arg => arg.startsWith('@composio/'))).toEqual([]);

    const wheels = ['composio-0.9.0-py3-none-any.whl', 'composio_openai-0.9.0-py3-none-any.whl'];
    const python = '/work/sdk-candidate/python';
    expect(pythonRequirement(python, wheels, 'composio-openai', '0.9.0')).toBe(
      '/work/sdk-candidate/python/composio_openai-0.9.0-py3-none-any.whl'
    );
    expect(pythonRequirement(python, wheels, 'composio', '0.9.0')).toBe(
      '/work/sdk-candidate/python/composio-0.9.0-py3-none-any.whl'
    );
    expect(pythonRequirement(python, wheels, 'composio-gemini', '0.9.0')).toBeUndefined();
  });
});

const exec = (cwd: string, executable: string, args: ReadonlyArray<string>) =>
  runRelease(run(executable, args, { cwd, env: withoutReleaseTokens }));

/** Packs a one-file package whose exports declare `./dist/index.js` and `./dist/index.d.ts`. */
const fixtureTarball = async (root: string, files: Record<string, string>) => {
  await writeText(
    `${root}/package/package.json`,
    JSON.stringify({
      name: '@composio/release-fixture',
      version: '1.0.0',
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    })
  );
  for (const [name, contents] of Object.entries(files))
    await writeText(`${root}/package/${name}`, contents);
  await exec(root, 'tar', ['-czf', 'fixture.tgz', 'package']);
  return `${root}/fixture.tgz`;
};

/** Installs the tarball offline into a consumer project that borrows the repository TypeScript. */
const consumerWith = async (tarball: string) => {
  const directory = await directories.create();
  await writeText(`${directory}/package.json`, JSON.stringify({ private: true, type: 'module' }));
  await exec(directory, 'npm', ['install', '--offline', '--ignore-scripts', '--no-audit', tarball]);
  await symlink(
    await resolvePath('node_modules/typescript'),
    `${directory}/node_modules/typescript`
  );
  await writeText(`${directory}/node_modules/.bin/.keep`, '');
  await symlink('../typescript/bin/tsc', `${directory}/node_modules/.bin/tsc`);
  return directory;
};

describe('strict npm consumer', () => {
  test('a candidate tarball missing a declared export fails, and the complete tarball passes', async () => {
    const complete = await fixtureTarball(await directories.create(), {
      'dist/index.js': 'export const value = 1;\n',
      'dist/index.d.ts': 'export declare const value: number;\n',
    });
    await runRelease(
      checkStrictConsumer(await consumerWith(complete), ['@composio/release-fixture'], [])
    );

    const missing = await fixtureTarball(await directories.create(), {
      'dist/index.js': 'export const value = 1;\n',
    });
    await expect(
      runRelease(
        checkStrictConsumer(await consumerWith(missing), ['@composio/release-fixture'], [])
      )
    ).rejects.toThrow('@composio/release-fixture');
  });
});

describe('candidate core with published providers', () => {
  test('installs the candidate core with each published provider, skips unpublished ones and names the one that fails', async () => {
    const cwd = await directories.create();
    const candidates = await directories.create();
    const work = await directories.create();
    await writeText(`${cwd}/mise.toml`, '[tools]\npython = "3.12.13"\n');
    await writeText(`${cwd}/python/composio/__version__.py`, '__version__ = "1.0.0"\n');
    await writeText(
      `${cwd}/python/pyproject.toml`,
      '[project]\nname = "composio"\nversion = "1.0.0"\n'
    );
    for (const provider of ['openai', 'broken', 'brandnew']) {
      await writeText(
        `${cwd}/python/providers/${provider}/pyproject.toml`,
        `[project]\nname = "composio-${provider}"\nversion = "1.0.0"\n`
      );
      await writeText(`${cwd}/python/providers/${provider}/setup.py`, 'setup(version="1.0.0")\n');
    }
    await writeText(`${candidates}/composio-1.0.0-py3-none-any.whl`, 'wheel');
    await writeText(`${candidates}/composio_openai-1.0.0-py3-none-any.whl`, 'wheel');
    const bin = `${cwd}/fake-bin`;
    const log = `${cwd}/uv.log`;
    await writeText(
      `${bin}/uv`,
      [
        '#!/bin/sh',
        `echo "$@" >> ${log}`,
        'if [ "$1" = venv ]; then',
        '  mkdir -p "$4/bin"',
        `  printf '#!/bin/sh\\ncase "$0" in *composio-broken*) echo "ImportError: boom" >&2; exit 1;; esac\\n' > "$4/bin/python"`,
        '  chmod +x "$4/bin/python"',
        'fi',
      ].join('\n')
    );
    await makeExecutable(`${bin}/uv`);
    const previous = process.env.PATH;
    try {
      process.env.PATH = `${bin}:${previous}`;
      await expect(
        runRelease(verifyPublishedProviders(cwd, candidates, '1.0.0', work), async input =>
          String(input).includes('/composio-brandnew/')
            ? new Response('{}', { status: 404 })
            : new Response('{}')
        )
      ).rejects.toThrow('Candidate composio breaks the latest published composio-broken');
    } finally {
      process.env.PATH = previous;
    }
    const installs = (await readText(log))
      .split('\n')
      .filter(line => line.startsWith('pip install'));
    const core = `${candidates}/composio-1.0.0-py3-none-any.whl`;
    expect(installs).toHaveLength(2);
    expect(installs[0]).toContain(core);
    expect(installs[0]).toMatch(/ composio-broken$/);
    expect(installs[1]).toContain(core);
    expect(installs[1]).toMatch(/ composio-openai$/);
  });
});
