import { Effect, FileSystem, Path, Schema } from 'effect';
import { Toml } from 'effect/encoding';
import { getPackages } from '@manypkg/get-packages';
import { LANGUAGES, type Language } from './lanes';
import { discoverPythonPackages } from './python-metadata';
import {
  ensure,
  fromPromise,
  readJson,
  run,
  runMain,
  withoutReleaseTokens,
  writeFile,
} from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';
import { discoverProviderCases } from '../../ts/scripts/check-provider-compatibility';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const PYPI_INDEX = 'https://pypi.org/simple';
const Versioned = Schema.Struct({ version: Schema.String });
const MiseTools = Schema.Struct({ tools: Schema.Struct({ python: Schema.String }) });

type Release = ReleaseBatch['plan']['releases'][number];

const installedVersion = (manifest: string) =>
  Effect.map(readJson(Versioned, manifest), value => value.version);

/** Peers that are not released themselves resolve to the workspace or installed version. */
const externalPeers = (
  npm: ReadonlyArray<Release>,
  packages: Awaited<ReturnType<typeof getPackages>>['packages']
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const peers = new Map<string, string>();
    for (const release of npm) {
      const pkg = packages.find(candidate => candidate.packageJson.name === release.name);
      for (const name of Object.keys(pkg?.packageJson.peerDependencies ?? {})) {
        if (npm.some(selected => selected.name === name)) continue;
        const local = packages.find(candidate => candidate.packageJson.name === name);
        const version =
          local?.packageJson.version ??
          (yield* installedVersion(
            path.join(pkg?.dir ?? '', 'node_modules', name, 'package.json')
          ));
        yield* ensure(
          !peers.has(name) || peers.get(name) === version,
          `Selected public consumers require incompatible versions of ${name}`
        );
        peers.set(name, version);
      }
    }
    return peers;
  });

const PROVIDER_TOOL_FIXTURE = `
import type { Tool, ExecuteToolFn } from '@composio/core';
const tool: Tool = { slug: 'RELEASE_CHECK', name: 'Release check', description: 'Checks public provider conversion', inputParameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }, toolkit: { slug: 'release', name: 'Release' }, tags: [] };
const execute: ExecuteToolFn = async () => ({ data: {}, error: null, successful: true });
`;

/** Installs the released npm packages fresh from the public registry and type-checks a strict consumer. */
const verifyNpmConsumer = (cwd: string, batch: ReleaseBatch, directory: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const command = (executable: string, args: ReadonlyArray<string>) =>
      run(executable, args, { cwd: directory, env: withoutReleaseTokens });
    const npm = batch.plan.releases.filter(release => release.language === 'typescript');
    const { packages } = yield* fromPromise(() => getPackages(cwd));
    const peers = yield* externalPeers(npm, packages);
    const typescript = yield* installedVersion(
      path.resolve(cwd, 'node_modules/typescript/package.json')
    );
    const nodeTypes = yield* installedVersion(
      path.resolve(cwd, 'node_modules/@types/node/package.json')
    );
    yield* writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ private: true, type: 'module' })
    );
    yield* command('npm', [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      `--registry=${NPM_REGISTRY}`,
      `typescript@${typescript}`,
      `@types/node@${nodeTypes}`,
      ...npm.map(release => `${release.name}@${release.newVersion}`),
      ...[...peers].map(([name, version]) => `${name}@${version}`),
    ]);
    yield* command('npm', ['audit', 'signatures', `--registry=${NPM_REGISTRY}`]);
    for (const release of npm) {
      const installed = yield* installedVersion(
        path.join(directory, 'node_modules', release.name, 'package.json')
      );
      yield* ensure(
        installed === release.newVersion &&
          packages.some(
            pkg =>
              pkg.packageJson.name === release.name &&
              pkg.packageJson.version === release.newVersion
          ),
        `Public npm consumer installed the wrong version: ${release.name}`
      );
    }
    const imports = npm
      .map(
        (release, index) =>
          `import * as sdk${index} from '${release.name}';\nconsole.log(Object.keys(sdk${index}).length);`
      )
      .join('\n');
    const providers = (yield* fromPromise(() => discoverProviderCases())).filter(provider =>
      npm.some(release => release.name === provider.name)
    );
    const providerContracts = providers.length
      ? `${PROVIDER_TOOL_FIXTURE}${providers
          .map(
            (provider, index) =>
              `import { ${provider.providerExportName} as Provider${index} } from '${provider.name}';\nconst wrapped${index} = new Provider${index}().wrapTool(tool${provider.agentic ? ', execute' : ''});\nif (!wrapped${index}) throw new Error('${provider.name} failed public conversion');`
          )
          .join('\n')}`
      : '';
    yield* writeFile(path.join(directory, 'consumer.ts'), imports + providerContracts);
    const providerDeclarationsOwnedByProviderCi = providers.length ? ['--skipLibCheck'] : [];
    yield* command(path.join(directory, 'node_modules/.bin/tsc'), [
      '--strict',
      '--noEmit',
      ...providerDeclarationsOwnedByProviderCi,
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'consumer.ts',
    ]);
    yield* command('node', ['consumer.ts']);
  });

const pythonVerifier = (packages: ReadonlyArray<string>, version: string) =>
  `import importlib, importlib.metadata, pathlib\npackages = ${JSON.stringify(packages)}\nfor name in packages:\n    distribution = importlib.metadata.distribution(name)\n    assert distribution.version == ${JSON.stringify(version)}, (name, distribution.version)\n    markers = [file for file in distribution.files or [] if str(file).endswith('/py.typed')]\n    assert markers, ('Missing typing metadata', name)\n    modules = {str(marker).split('/')[0] for marker in markers}\n    for module in modules:\n        importlib.import_module(module)\n        assert pathlib.Path(distribution.locate_file(module), 'py.typed').exists()\nprint('Verified public imports, exact versions and typing metadata:', packages)\n`;

/** Each Python package gets its own environment: providers have incompatible dependency trains. */
const verifyPythonConsumer = (cwd: string, batch: ReleaseBatch, directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const command = (executable: string, args: ReadonlyArray<string>) =>
      run(executable, args, { cwd: directory, env: withoutReleaseTokens });
    const version =
      batch.plan.releases.find(release => release.language === 'python')?.newVersion ?? '';
    const packages = yield* discoverPythonPackages(cwd);
    const mise = yield* Effect.fromResult(
      Toml.parse(yield* fs.readFileString(path.resolve(cwd, 'mise.toml')))
    );
    const pythonVersion = (yield* Schema.decodeUnknownEffect(MiseTools)(mise)).tools.python;
    for (const pkg of packages) {
      const environment = path.join(directory, pkg.name);
      yield* command('uv', ['venv', '--python', pythonVersion, environment]);
      const executable = path.join(environment, 'bin/python');
      const requirements = [...new Set([`composio==${version}`, `${pkg.name}==${version}`])];
      yield* command('uv', [
        'pip',
        'install',
        '--python',
        executable,
        '--index-url',
        PYPI_INDEX,
        ...requirements,
      ]);
      yield* command('uv', ['pip', 'check', '--python', executable]);
      yield* writeFile(
        path.join(environment, 'verify.py'),
        pythonVerifier([...new Set(['composio', pkg.name])], version)
      );
      yield* command(executable, [path.join(environment, 'verify.py')]);
    }
  });

const PUBLIC_CONSUMERS: Record<Language, typeof verifyNpmConsumer | typeof verifyPythonConsumer> = {
  typescript: verifyNpmConsumer,
  python: verifyPythonConsumer,
};

/** Verifies every released language from fresh public installs, TypeScript first. */
export const verifyPublicConsumers = (cwd: string, batch: ReleaseBatch) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'sdk-public-consumer-' });
      const released = LANGUAGES.filter(language =>
        batch.plan.releases.some(release => release.language === language)
      );
      for (const language of released) yield* PUBLIC_CONSUMERS[language](cwd, batch, directory);
    })
  );

const main = Effect.gen(function* () {
  const cwd = (yield* Path.Path).resolve('.');
  yield* verifyPublicConsumers(cwd, yield* readJson(ReleaseBatch, BATCH_PATH));
});

if (import.meta.main) runMain(main);
