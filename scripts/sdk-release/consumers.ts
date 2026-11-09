import { Effect, FileSystem, Path, Schema, Stdio } from 'effect';
import { HttpClient } from 'effect/http';
import { Toml } from 'effect/encoding';
import { getPackages } from '@manypkg/get-packages';
import {
  CANDIDATE_MANIFEST,
  CandidateManifest,
  readCandidateFiles,
  verifyCandidateFiles,
} from './artifacts';
import { prepareCandidateSource, tarballName } from './candidates';
import { NPM_REGISTRY, REGISTRY_VERSION, type Language } from './lanes';
import { discoverPythonPackages } from './python-metadata';
import {
  ensure,
  fail,
  fromPromise,
  inDirectory,
  readJson,
  ReleaseError,
  runMain,
  writeFile,
} from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';
import {
  discoverProviderCases,
  type ProviderCompatibilityCase,
} from '../../ts/scripts/check-provider-compatibility';

const PYPI_INDEX = 'https://pypi.org/simple';
const Versioned = Schema.Struct({ version: Schema.String });
const MiseTools = Schema.Struct({ tools: Schema.Struct({ python: Schema.String }) });

type Release = ReleaseBatch['plan']['releases'][number];

/** Third-party packages come from the registry; SDK packages come from the candidate directory. */
export const npmInstallArgs = (
  candidates: string,
  releases: ReadonlyArray<Pick<Release, 'name' | 'newVersion'>>,
  others: ReadonlyArray<string>
) => [
  'install',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  `--registry=${NPM_REGISTRY}`,
  ...others,
  ...releases.map(release => `${candidates}/${tarballName(release.name, release.newVersion)}`),
];

/** The candidate wheel file for that package and version. */
export const pythonRequirement = (
  candidates: string,
  wheels: ReadonlyArray<string>,
  name: string,
  version: string
) => {
  const prefix = `${name.replaceAll('-', '_')}-${version}-`;
  const wheel = wheels.find(file => file.startsWith(prefix) && file.endsWith('.whl'));
  return wheel && `${candidates}/${wheel}`;
};

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

/** Type-checks and runs a strict consumer of the installed packages and provider contracts. */
export const checkStrictConsumer = (
  directory: string,
  names: ReadonlyArray<string>,
  providers: ReadonlyArray<ProviderCompatibilityCase>
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const command = inDirectory(directory);
    const imports = names
      .map(
        (name, index) =>
          `import * as sdk${index} from '${name}';\nconsole.log(Object.keys(sdk${index}).length);`
      )
      .join('\n');
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

/** Installs the candidate npm packages fresh and type-checks a strict consumer. */
const verifyNpmConsumer = (
  cwd: string,
  batch: ReleaseBatch,
  directory: string,
  candidates: string
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const command = inDirectory(directory);
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
    yield* command(
      'npm',
      npmInstallArgs(candidates, npm, [
        `typescript@${typescript}`,
        `@types/node@${nodeTypes}`,
        ...[...peers].map(([name, version]) => `${name}@${version}`),
      ])
    );
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
        `Candidate consumer installed the wrong version: ${release.name}`
      );
    }
    const providers = (yield* fromPromise(() => discoverProviderCases())).filter(provider =>
      npm.some(release => release.name === provider.name)
    );
    yield* checkStrictConsumer(
      directory,
      npm.map(release => release.name),
      providers
    );
  });

const pythonVerifier = (packages: ReadonlyArray<string>, version: string) =>
  `import importlib, importlib.metadata, pathlib\npackages = ${JSON.stringify(packages)}\nfor name in packages:\n    distribution = importlib.metadata.distribution(name)\n    assert distribution.version == ${JSON.stringify(version)}, (name, distribution.version)\n    markers = [file for file in distribution.files or [] if str(file).endswith('/py.typed')]\n    assert markers, ('Missing typing metadata', name)\n    modules = {str(marker).split('/')[0] for marker in markers}\n    for module in modules:\n        importlib.import_module(module)\n        assert pathlib.Path(distribution.locate_file(module), 'py.typed').exists()\nprint('Verified public imports, exact versions and typing metadata:', packages)\n`;

const pythonVersion = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const mise = yield* Effect.fromResult(
      Toml.parse(yield* fs.readFileString(path.resolve(cwd, 'mise.toml')))
    );
    return (yield* Schema.decodeUnknownEffect(MiseTools)(mise)).tools.python;
  });

const candidateWheels = (candidates: string) =>
  Effect.flatMap(FileSystem.FileSystem, fs => fs.readDirectory(candidates));

/** Each Python package gets its own environment: providers have incompatible dependency trains. */
const verifyPythonConsumer = (
  cwd: string,
  batch: ReleaseBatch,
  directory: string,
  candidates: string
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const command = inDirectory(directory);
    const version = REGISTRY_VERSION.python(
      batch.plan.releases.find(release => release.language === 'python')?.newVersion ?? ''
    );
    const packages = yield* discoverPythonPackages(cwd);
    const python = yield* pythonVersion(cwd);
    const wheels = yield* candidateWheels(candidates);
    const requirement = (name: string) =>
      Effect.fromNullishOr(pythonRequirement(candidates, wheels, name, version)).pipe(
        Effect.mapError(() => new ReleaseError({ message: `Missing candidate wheel: ${name}` }))
      );
    for (const pkg of packages) {
      const environment = path.join(directory, pkg.name);
      yield* command('uv', ['venv', '--python', python, environment]);
      const executable = path.join(environment, 'bin/python');
      const names = [...new Set(['composio', pkg.name])];
      yield* command('uv', [
        'pip',
        'install',
        '--python',
        executable,
        '--index-url',
        PYPI_INDEX,
        ...(yield* Effect.forEach(names, requirement)),
      ]);
      yield* command('uv', ['pip', 'check', '--python', executable]);
      yield* writeFile(path.join(environment, 'verify.py'), pythonVerifier(names, version));
      yield* command(executable, [path.join(environment, 'verify.py')]);
    }
  });

const providerImport = (name: string) =>
  `import importlib, importlib.metadata\ndistribution = importlib.metadata.distribution(${JSON.stringify(name)})\nmodules = {str(file).split('/')[0] for file in distribution.files or [] if str(file).endswith('/__init__.py')}\nassert modules, ('No importable modules', ${JSON.stringify(name)})\nfor module in sorted(modules):\n    importlib.import_module(module)\nprint('Imported', ${JSON.stringify(name)}, distribution.version)\n`;

/**
 * Providers depend on an unpinned `composio`, so users can upgrade core alone: install the
 * candidate core wheel with each provider's latest published version and import the provider.
 */
export const verifyPublishedProviders = (
  cwd: string,
  candidates: string,
  version: string,
  directory: string
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const command = inDirectory(directory);
    const python = yield* pythonVersion(cwd);
    const core = pythonRequirement(
      candidates,
      yield* candidateWheels(candidates),
      'composio',
      version
    );
    if (!core) return yield* fail('Missing candidate wheel: composio');
    const providers = (yield* discoverPythonPackages(cwd)).filter(pkg => pkg.name !== 'composio');
    const failures: string[] = [];
    const client = yield* HttpClient.HttpClient;
    for (const provider of providers) {
      // A provider released for the first time has no published version to check against yet.
      const published = yield* client.get(`https://pypi.org/pypi/${provider.name}/json`);
      if (published.status === 404) continue;
      const environment = path.join(directory, `published-${provider.name}`);
      const executable = path.join(environment, 'bin/python');
      yield* Effect.gen(function* () {
        yield* command('uv', ['venv', '--python', python, environment]);
        yield* command('uv', [
          'pip',
          'install',
          '--python',
          executable,
          '--index-url',
          PYPI_INDEX,
          core,
          provider.name,
        ]);
        yield* writeFile(path.join(environment, 'verify.py'), providerImport(provider.name));
        yield* command(executable, [path.join(environment, 'verify.py')]);
      }).pipe(
        Effect.catch(error =>
          Effect.sync(() =>
            failures.push(
              `Candidate composio breaks the latest published ${provider.name}: ${error.message}`
            )
          )
        )
      );
    }
    yield* ensure(failures.length === 0, failures.join('\n'));
  });

const CONSUMERS: Record<Language, typeof verifyNpmConsumer | typeof verifyPythonConsumer> = {
  typescript: verifyNpmConsumer,
  python: verifyPythonConsumer,
};

/** Reads a downloaded candidate and checks every file against its manifest. */
export const readVerifiedCandidate = (candidates: string) =>
  Effect.gen(function* () {
    const manifest = yield* readJson(CandidateManifest, `${candidates}/${CANDIDATE_MANIFEST}`);
    const files = yield* readCandidateFiles(candidates);
    yield* verifyCandidateFiles(files, manifest.files);
    return { manifest, files };
  });

/** Checks a downloaded candidate against its manifest, then installs and imports it like a user. */
export const verifyCandidateConsumers = (cwd: string, batch: ReleaseBatch, candidates: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { manifest } = yield* readVerifiedCandidate(candidates);
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'sdk-candidate-consumer-' });
      yield* CONSUMERS[manifest.language](cwd, batch, directory, candidates);
      const python = batch.plan.releases.find(release => release.language === 'python');
      if (manifest.language === 'python' && python)
        yield* verifyPublishedProviders(
          cwd,
          candidates,
          REGISTRY_VERSION.python(python.newVersion),
          directory
        );
    })
  );

/** `consumers.ts <candidate-dir>` installs a downloaded candidate like a user would. */
const main = Effect.gen(function* () {
  const path = yield* Path.Path;
  const [candidates] = yield* Schema.decodeUnknownEffect(Schema.Tuple([Schema.String]))(
    yield* (yield* Stdio.Stdio).args
  );
  const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
  yield* prepareCandidateSource(path.resolve('.'), batch);
  yield* verifyCandidateConsumers(path.resolve('.'), batch, path.resolve(candidates));
});

if (import.meta.main) runMain(main);
