import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPackages } from '@manypkg/get-packages';
import { z } from 'zod';
import { runPreparationCommand } from './commands';
import { discoverPythonPackages } from './python-metadata';
import { batchPath, releaseBatchSchema, type ReleaseBatch } from './source';
import { discoverProviderCases } from '../../ts/scripts/check-provider-compatibility';

export async function verifyPublicConsumers(cwd: string, batch: ReleaseBatch) {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-public-consumer-'));
  try {
    const npm = batch.plan.releases.filter(release => release.language === 'typescript');
    if (npm.length) {
      const { packages } = await getPackages(cwd);
      const peers = new Map<string, string>();
      for (const release of npm) {
        const pkg = packages.find(pkg => pkg.packageJson.name === release.name)!;
        for (const name of Object.keys(pkg.packageJson.peerDependencies ?? {})) {
          if (npm.some(release => release.name === name)) continue;
          const local = packages.find(pkg => pkg.packageJson.name === name);
          const version =
            local?.packageJson.version ??
            z
              .object({ version: z.string() })
              .parse(
                JSON.parse(
                  await readFile(join(pkg.dir, 'node_modules', name, 'package.json'), 'utf8')
                )
              ).version;
          if (peers.has(name) && peers.get(name) !== version)
            throw new Error(`Selected public consumers require incompatible versions of ${name}`);
          peers.set(name, version);
        }
      }
      const typescript = z
        .object({ version: z.string() })
        .parse(
          JSON.parse(await readFile(resolve(cwd, 'node_modules/typescript/package.json'), 'utf8'))
        ).version;
      const nodeTypes = z
        .object({ version: z.string() })
        .parse(
          JSON.parse(await readFile(resolve(cwd, 'node_modules/@types/node/package.json'), 'utf8'))
        ).version;
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ private: true, type: 'module' })
      );
      runPreparationCommand(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--registry=https://registry.npmjs.org',
          `typescript@${typescript}`,
          `@types/node@${nodeTypes}`,
          ...npm.map(release => `${release.name}@${release.newVersion}`),
          ...[...peers].map(([name, version]) => `${name}@${version}`),
        ],
        directory
      );
      runPreparationCommand(
        'npm',
        ['audit', 'signatures', '--registry=https://registry.npmjs.org'],
        directory
      );
      for (const release of npm) {
        const installed = z
          .object({ version: z.string() })
          .parse(
            JSON.parse(
              await readFile(join(directory, 'node_modules', release.name, 'package.json'), 'utf8')
            )
          );
        if (
          installed.version !== release.newVersion ||
          !packages.some(
            pkg =>
              pkg.packageJson.name === release.name &&
              pkg.packageJson.version === release.newVersion
          )
        )
          throw new Error(`Public npm consumer installed the wrong version: ${release.name}`);
      }
      const imports = npm
        .map(
          (release, index) =>
            `import * as sdk${index} from '${release.name}';\nconsole.log(Object.keys(sdk${index}).length);`
        )
        .join('\n');
      const providers = (await discoverProviderCases()).filter(provider =>
        npm.some(release => release.name === provider.name)
      );
      const providerContracts = providers.length
        ? `\nimport type { Tool, ExecuteToolFn } from '@composio/core';\nconst tool: Tool = { slug: 'RELEASE_CHECK', name: 'Release check', description: 'Checks public provider conversion', inputParameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }, toolkit: { slug: 'release', name: 'Release' }, tags: [] };\nconst execute: ExecuteToolFn = async () => ({ data: {}, error: null, successful: true });\n${providers.map((provider, index) => `import { ${provider.providerExportName} as Provider${index} } from '${provider.name}';\nconst wrapped${index} = new Provider${index}().wrapTool(tool${provider.agentic ? ', execute' : ''});\nif (!wrapped${index}) throw new Error('${provider.name} failed public conversion');`).join('\n')}`
        : '';
      await writeFile(join(directory, 'consumer.ts'), imports + providerContracts);
      runPreparationCommand(
        join(directory, 'node_modules/.bin/tsc'),
        [
          '--strict',
          '--noEmit',
          // The aggregate checks strict consumer contracts. Provider CI owns upstream declaration internals.
          ...(providers.length ? ['--skipLibCheck'] : []),
          '--target',
          'ES2022',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          'consumer.ts',
        ],
        directory
      );
      runPreparationCommand('node', ['consumer.ts'], directory);
    }
    const python = batch.plan.releases.find(release => release.language === 'python');
    if (python) {
      const packages = await discoverPythonPackages(cwd);
      const pythonVersion = z
        .object({ tools: z.object({ python: z.string() }) })
        .parse(Bun.TOML.parse(await readFile(resolve(cwd, 'mise.toml'), 'utf8'))).tools.python;
      for (const pkg of packages) {
        const environment = join(directory, pkg.name);
        runPreparationCommand('uv', ['venv', '--python', pythonVersion, environment], directory);
        const executable = join(environment, 'bin/python');
        // Providers have incompatible third-party dependency trains; each is a separate public consumer.
        const requirements = [
          ...new Set([`composio==${python.newVersion}`, `${pkg.name}==${python.newVersion}`]),
        ];
        runPreparationCommand(
          'uv',
          [
            'pip',
            'install',
            '--python',
            executable,
            '--index-url',
            'https://pypi.org/simple',
            ...requirements,
          ],
          directory
        );
        runPreparationCommand('uv', ['pip', 'check', '--python', executable], directory);
        await writeFile(
          join(environment, 'verify.py'),
          `import importlib, importlib.metadata, pathlib\npackages = ${JSON.stringify([...new Set(['composio', pkg.name])])}\nfor name in packages:\n    distribution = importlib.metadata.distribution(name)\n    assert distribution.version == ${JSON.stringify(python.newVersion)}, (name, distribution.version)\n    markers = [file for file in distribution.files or [] if str(file).endswith('/py.typed')]\n    assert markers, ('Missing typing metadata', name)\n    modules = {str(marker).split('/')[0] for marker in markers}\n    for module in modules:\n        importlib.import_module(module)\n        assert pathlib.Path(distribution.locate_file(module), 'py.typed').exists()\nprint('Verified public imports, exact versions and typing metadata:', packages)\n`
        );
        runPreparationCommand(executable, [join(environment, 'verify.py')], directory);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main)
  await verifyPublicConsumers(
    process.cwd(),
    releaseBatchSchema.parse(await Bun.file(batchPath).json())
  );
