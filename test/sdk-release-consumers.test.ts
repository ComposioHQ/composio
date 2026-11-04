import { afterEach, describe, expect, test } from 'bun:test';
import { candidateArtifactName } from '../scripts/sdk-release/artifacts';
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
  test('local source installs SDK packages from candidate files, never by registry name', () => {
    const local = { kind: 'local', directory: '/work/sdk-candidate/typescript' } as const;
    const args = npmInstallArgs(
      local,
      [release('@composio/core', '1.2.3'), release('@composio/openai', '2.0.0')],
      ['typescript@5.9.3']
    );
    expect(args).toContain('/work/sdk-candidate/typescript/composio-core-1.2.3.tgz');
    expect(args).toContain('/work/sdk-candidate/typescript/composio-openai-2.0.0.tgz');
    expect(args.filter(arg => arg.startsWith('@composio/'))).toEqual([]);
    expect(
      npmInstallArgs({ kind: 'registry' }, [release('@composio/core', '1.2.3')], [])
    ).toContain('@composio/core@1.2.3');

    const wheels = ['composio-0.9.0-py3-none-any.whl', 'composio_openai-0.9.0-py3-none-any.whl'];
    const python = { kind: 'local', directory: '/work/sdk-candidate/python' } as const;
    expect(pythonRequirement(python, wheels, 'composio-openai', '0.9.0')).toBe(
      '/work/sdk-candidate/python/composio_openai-0.9.0-py3-none-any.whl'
    );
    expect(pythonRequirement(python, wheels, 'composio', '0.9.0')).toBe(
      '/work/sdk-candidate/python/composio-0.9.0-py3-none-any.whl'
    );
    expect(pythonRequirement({ kind: 'registry' }, [], 'composio', '0.9.0')).toBe(
      'composio==0.9.0'
    );
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
  test('installs the candidate core wheel with each latest provider and names the one that fails', async () => {
    const cwd = await directories.create();
    const candidates = await directories.create();
    const work = await directories.create();
    await writeText(`${cwd}/mise.toml`, '[tools]\npython = "3.12.13"\n');
    await writeText(`${cwd}/python/composio/__version__.py`, '__version__ = "1.0.0"\n');
    await writeText(
      `${cwd}/python/pyproject.toml`,
      '[project]\nname = "composio"\nversion = "1.0.0"\n'
    );
    for (const provider of ['openai', 'broken']) {
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
        runRelease(verifyPublishedProviders(cwd, candidates, '1.0.0', work))
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

type Step = { uses?: string; with?: Record<string, unknown> };
type Job = { name?: string; needs?: string; permissions?: unknown; steps: Step[] };

describe('candidate workflow', () => {
  test('the smoke job only downloads the build artifact, which the tag run copies by name', async () => {
    const workflow = Bun.YAML.parse(
      await Bun.file('.github/workflows/sdk.release.candidates.yml').text()
    ) as { permissions: unknown; jobs: Record<string, Job> };
    const uploads = Object.entries(workflow.jobs).flatMap(([id, job]) =>
      job.steps
        .filter(step => step.uses?.startsWith('actions/upload-artifact@'))
        .map(step => ({ id, name: step.with?.name }))
    );
    expect(uploads).toEqual([{ id: 'candidate', name: 'sdk-candidate-${{ matrix.language }}' }]);
    expect(candidateArtifactName('python')).toBe('sdk-candidate-python');

    const smoke = workflow.jobs.smoke;
    expect(smoke.name).toBe('SDK candidate smoke (${{ matrix.language }})');
    expect(smoke.needs).toContain('candidate');
    expect(smoke.permissions ?? workflow.permissions).toEqual({
      contents: 'read',
      actions: 'read',
    });
    const download = smoke.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
    expect(download?.with?.name).toBe('sdk-candidate-${{ matrix.language }}');
  });
});
