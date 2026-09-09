#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const providersDir = path.join(repoRoot, 'ts/packages/providers');
const coreDir = path.join(repoRoot, 'ts/packages/core');
const jsonSchemaToZodDir = path.join(repoRoot, 'ts/packages/json-schema-to-zod');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// Published 0.x floors remain unchanged until the planned breaking release. These verified
// floors keep the artifact gate green only for combinations the current providers can load.
const PROVIDER_CONTRACTS: Record<
  string,
  { agentic: boolean; exportName: string; verifiedMinimumCore: string }
> = {
  '@composio/anthropic': {
    agentic: false,
    exportName: 'AnthropicProvider',
    verifiedMinimumCore: '0.14.0',
  },
  '@composio/claude-agent-sdk': {
    agentic: true,
    exportName: 'ClaudeAgentSDKProvider',
    verifiedMinimumCore: '0.11.0',
  },
  '@composio/cloudflare': {
    agentic: false,
    exportName: 'CloudflareProvider',
    verifiedMinimumCore: '0.14.0',
  },
  '@composio/google': {
    agentic: false,
    exportName: 'GoogleProvider',
    verifiedMinimumCore: '0.16.0',
  },
  '@composio/langchain': {
    agentic: true,
    exportName: 'LangchainProvider',
    verifiedMinimumCore: '0.11.0',
  },
  '@composio/llamaindex': {
    agentic: true,
    exportName: 'LlamaindexProvider',
    verifiedMinimumCore: '0.11.0',
  },
  '@composio/mastra': {
    agentic: true,
    exportName: 'MastraProvider',
    verifiedMinimumCore: '0.18.0',
  },
  '@composio/openai': {
    agentic: false,
    exportName: 'OpenAIProvider',
    verifiedMinimumCore: '0.18.0',
  },
  '@composio/openai-agents': {
    agentic: true,
    exportName: 'OpenAIAgentsProvider',
    verifiedMinimumCore: '0.18.0',
  },
  '@composio/vercel': {
    agentic: true,
    exportName: 'VercelProvider',
    verifiedMinimumCore: '0.18.0',
  },
};

const StringRecordSchema = z.record(z.string(), z.string());
const PackageManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    peerDependencies: StringRecordSchema.default({}),
    dependencies: StringRecordSchema.default({}),
  })
  .passthrough();
const JSON_SCHEMA_TO_ZOD = '@composio/json-schema-to-zod';
const InstalledPackageManifestSchema = z.object({ version: z.string().min(1) }).passthrough();

export type ProviderCompatibilityCase = {
  directory: string;
  name: string;
  version: string;
  advertisedMinimumCoreVersion: string;
  verifiedMinimumCoreVersion: string;
  agentic: boolean;
  providerExportName: string;
  externalPeers: Record<string, string>;
};

export type CompatibilityLane = {
  id: string;
  core:
    | { kind: 'workspace' }
    | { kind: 'workspace-prerelease'; version: string }
    | { kind: 'registry'; specifier: string };
  providerNames: string[];
  // The release-blocking workspace lane installs exactly as a consumer does so install-time
  // lifecycle failures cannot pass the gate; the other lanes skip that cost.
  lifecycleScripts: 'run' | 'skip';
};

export type CliOptions = {
  lanes: Set<'current' | 'minimum' | 'beta'>;
  planOnly: boolean;
};

async function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T> {
  const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid JSON in ${path.relative(repoRoot, filePath)}: ${result.error.message}`
    );
  }
  return result.data;
}

function installedPeerManifestPath(providerDirectory: string, peerName: string): string {
  return path.join(providerDirectory, 'node_modules', ...peerName.split('/'), 'package.json');
}

async function readInstalledPeerVersion(
  providerDirectory: string,
  peerName: string
): Promise<string> {
  const manifestPath = installedPeerManifestPath(providerDirectory, peerName);
  try {
    const manifest = await readJsonFile(manifestPath, InstalledPackageManifestSchema);
    return manifest.version;
  } catch (error) {
    throw new Error(
      `Could not resolve installed peer ${peerName} for ${path.relative(repoRoot, providerDirectory)}. Run pnpm install first.`,
      { cause: error }
    );
  }
}

export async function discoverProviderCases(): Promise<ProviderCompatibilityCase[]> {
  const entries = await readdir(providersDir, { withFileTypes: true });
  const providers: ProviderCompatibilityCase[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const directory = path.join(providersDir, entry.name);
    const manifestPath = path.join(directory, 'package.json');
    try {
      await access(manifestPath);
    } catch {
      continue;
    }

    const manifest = await readJsonFile(manifestPath, PackageManifestSchema);
    const coreRange = manifest.peerDependencies['@composio/core'];
    if (!coreRange) {
      throw new Error(`${manifest.name} must declare @composio/core as a peer dependency`);
    }

    const minimumCore = semver.minVersion(coreRange);
    if (!minimumCore) {
      throw new Error(`${manifest.name} has an invalid @composio/core peer range: ${coreRange}`);
    }
    const contract = PROVIDER_CONTRACTS[manifest.name];
    if (!contract) {
      throw new Error(`${manifest.name} must define a packed consumer contract`);
    }

    const externalPeers: Record<string, string> = {};
    for (const peerName of Object.keys(manifest.peerDependencies).sort()) {
      if (peerName === '@composio/core') continue;
      externalPeers[peerName] = await readInstalledPeerVersion(directory, peerName);
    }

    providers.push({
      directory,
      name: manifest.name,
      version: manifest.version,
      advertisedMinimumCoreVersion: minimumCore.version,
      verifiedMinimumCoreVersion: contract.verifiedMinimumCore,
      agentic: contract.agentic,
      providerExportName: contract.exportName,
      externalPeers,
    });
  }

  if (providers.length === 0) {
    throw new Error('No provider packages were found');
  }

  return providers.sort((left, right) => left.name.localeCompare(right.name));
}

export function buildCompatibilityPlan(
  providers: ProviderCompatibilityCase[],
  prereleaseVersion = process.env.COMPOSIO_CORE_PRERELEASE_VERSION || '1.0.0-beta.0'
): CompatibilityLane[] {
  const providerNames = providers.map(provider => provider.name);
  const lanes: CompatibilityLane[] = [
    {
      id: 'workspace-current',
      core: { kind: 'workspace' },
      providerNames,
      lifecycleScripts: 'run',
    },
  ];

  for (const provider of providers) {
    lanes.push({
      id: `verified-minimum-core-${provider.verifiedMinimumCoreVersion}-${provider.name.replace('@', '').replace('/', '-')}`,
      core: { kind: 'registry', specifier: provider.verifiedMinimumCoreVersion },
      providerNames: [provider.name],
      lifecycleScripts: 'skip',
    });
  }

  lanes.push({
    id: 'workspace-major-prerelease',
    core: { kind: 'workspace-prerelease', version: prereleaseVersion },
    providerNames,
    lifecycleScripts: 'skip',
  });

  return lanes;
}

export function parseCliOptions(args: string[]): CliOptions {
  const lanes = new Set<'current' | 'minimum' | 'beta'>();
  let planOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    }
    if (argument === '--plan') {
      planOnly = true;
      continue;
    }
    if (argument === '--lane') {
      const lane = args[index + 1];
      if (lane !== 'current' && lane !== 'minimum' && lane !== 'beta') {
        throw new Error('--lane must be current, minimum, or beta');
      }
      lanes.add(lane);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (lanes.size === 0) {
    lanes.add('current');
    lanes.add('minimum');
    lanes.add('beta');
  }

  return { lanes, planOnly };
}

function laneCategory(lane: CompatibilityLane): 'current' | 'minimum' | 'beta' {
  if (lane.id === 'workspace-current') return 'current';
  if (lane.id === 'workspace-major-prerelease') return 'beta';
  return 'minimum';
}

function run(command: string, args: string[], cwd = repoRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      npm_config_update_notifier: 'false',
    },
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    const lines = output.split('\n');
    const relevantOutput =
      lines.length > 120
        ? [
            ...lines.slice(0, 40),
            `... ${lines.length - 120} lines omitted ...`,
            ...lines.slice(-80),
          ].join('\n')
        : output;
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, relevantOutput].filter(Boolean).join('\n')
    );
  }

  return result.stdout.trim();
}

function packageTarballName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`;
}

async function packPackage(
  packageDirectory: string,
  packageName: string,
  version: string,
  artifactDirectory: string
): Promise<string> {
  run(pnpmBin, [
    '--dir',
    packageDirectory,
    'pack',
    '--pack-destination',
    artifactDirectory,
    '--silent',
  ]);
  const tarballPath = path.join(artifactDirectory, packageTarballName(packageName, version));
  await access(tarballPath);

  const contents = run('tar', ['-tzf', tarballPath]);
  for (const requiredPath of [
    'package/package.json',
    'package/dist/index.mjs',
    'package/dist/index.d.mts',
  ]) {
    if (!contents.split('\n').includes(requiredPath)) {
      throw new Error(`${packageName} tarball is missing ${requiredPath}`);
    }
  }

  return tarballPath;
}

async function packWorkspaceArtifacts(
  providers: ProviderCompatibilityCase[],
  artifactDirectory: string,
  prereleaseVersion: string
): Promise<Map<string, string>> {
  const coreManifest = await readJsonFile(
    path.join(coreDir, 'package.json'),
    PackageManifestSchema
  );
  const jsonSchemaManifest = await readJsonFile(
    path.join(jsonSchemaToZodDir, 'package.json'),
    PackageManifestSchema
  );
  const tarballs = new Map<string, string>();

  const jsonSchemaTarball = await packPackage(
    jsonSchemaToZodDir,
    jsonSchemaManifest.name,
    jsonSchemaManifest.version,
    artifactDirectory
  );
  const packedCore = await packPackage(
    coreDir,
    coreManifest.name,
    coreManifest.version,
    artifactDirectory
  );
  tarballs.set(
    coreManifest.name,
    await repackCoreTarball(packedCore, coreManifest.name, {
      version: coreManifest.version,
      jsonSchemaTarball,
      artifactDirectory: path.join(artifactDirectory, 'core-workspace'),
    })
  );
  tarballs.set(
    `${coreManifest.name}@prerelease`,
    await repackCoreTarball(packedCore, coreManifest.name, {
      version: prereleaseVersion,
      jsonSchemaTarball,
      artifactDirectory: path.join(artifactDirectory, 'core-prerelease'),
    })
  );

  for (const provider of providers) {
    tarballs.set(
      provider.name,
      await packPackage(provider.directory, provider.name, provider.version, artifactDirectory)
    );
  }

  return tarballs;
}

export async function repackCoreTarball(
  tarballPath: string,
  packageName: string,
  options: { version: string; jsonSchemaTarball: string; artifactDirectory: string }
): Promise<string> {
  // Consumers install core and providers only, so the unpublished workspace helper must reach
  // them through core's own dependency declaration. A release gate also cannot depend on a
  // prerelease that has not been published yet, so the same repack re-versions the exact
  // workspace tarball for the prerelease peer lane.
  const stagingDirectory = path.join(options.artifactDirectory, 'staging');
  await mkdir(stagingDirectory, { recursive: true });
  run('tar', ['-xzf', tarballPath, '-C', stagingDirectory]);

  const manifestPath = path.join(stagingDirectory, 'package/package.json');
  const manifest = await readJsonFile(manifestPath, PackageManifestSchema);
  if (!manifest.dependencies[JSON_SCHEMA_TO_ZOD]) {
    throw new Error(
      `${packageName} packed manifest must declare ${JSON_SCHEMA_TO_ZOD} as a dependency`
    );
  }
  manifest.version = options.version;
  manifest.dependencies[JSON_SCHEMA_TO_ZOD] = `file:${options.jsonSchemaTarball}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const repackedTarball = path.join(
    options.artifactDirectory,
    packageTarballName(packageName, options.version)
  );
  run('tar', ['-czf', repackedTarball, '-C', stagingDirectory, 'package']);
  return repackedTarball;
}

function mergeExternalPeers(providers: ProviderCompatibilityCase[]): Record<string, string> {
  const peers: Record<string, string> = {};
  for (const provider of providers) {
    for (const [peerName, version] of Object.entries(provider.externalPeers)) {
      const existingVersion = peers[peerName];
      if (existingVersion && existingVersion !== version) {
        throw new Error(
          `${peerName} resolves to both ${existingVersion} and ${version} across provider fixtures`
        );
      }
      peers[peerName] = version;
    }
  }
  return peers;
}

async function writeConsumerFixture(
  fixtureDirectory: string,
  lane: CompatibilityLane,
  providers: ProviderCompatibilityCase[],
  tarballs: Map<string, string>
): Promise<void> {
  const dependencies: Record<string, string> = {
    ...mergeExternalPeers(providers),
    typescript: (
      await readJsonFile(
        path.join(repoRoot, 'node_modules/typescript/package.json'),
        InstalledPackageManifestSchema
      )
    ).version,
  };

  for (const provider of providers) {
    const tarball = tarballs.get(provider.name);
    if (!tarball) throw new Error(`Missing packed artifact for ${provider.name}`);
    dependencies[provider.name] = `file:${tarball}`;
  }

  if (lane.core.kind !== 'registry') {
    const coreTarball = tarballs.get(
      lane.core.kind === 'workspace' ? '@composio/core' : '@composio/core@prerelease'
    );
    if (!coreTarball) {
      throw new Error('Missing packed core workspace artifact');
    }
    dependencies['@composio/core'] = `file:${coreTarball}`;
  } else {
    dependencies['@composio/core'] = lane.core.specifier;
  }

  const imports = providers.map((provider, index) => ({
    identifier: `provider${index}`,
    name: provider.name,
    exportName: provider.providerExportName,
    agentic: provider.agentic,
  }));

  await writeFile(
    path.join(fixtureDirectory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`
  );
  await writeFile(
    path.join(fixtureDirectory, 'index.ts'),
    `import type { ExecuteToolFn, Tool } from '@composio/core';\n${imports
      .map(item => `import { ${item.exportName} as ${item.identifier} } from '${item.name}';`)
      .join(
        '\n'
      )}\nconst tool: Tool = { slug: 'COMPATIBILITY_CHECK', name: 'Compatibility check', description: 'Checks packed provider conversion', inputParameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }, toolkit: { slug: 'compatibility', name: 'Compatibility' }, tags: [] };\nconst executeTool: ExecuteToolFn = async () => ({ data: {}, error: null, successful: true });\n${imports
      .map(
        item =>
          `const ${item.identifier}Instance = new ${item.identifier}();\nconst ${item.identifier}Tool = ${item.identifier}Instance.wrapTool(tool${item.agentic ? ', executeTool' : ''});\nvoid ${item.identifier}Tool;`
      )
      .join('\n')}\n`
  );
  await writeFile(
    path.join(fixtureDirectory, 'index.mjs'),
    `const providerContracts = ${JSON.stringify(imports.map(item => [item.name, item.exportName, item.agentic]))};\nconst tool = { slug: 'COMPATIBILITY_CHECK', name: 'Compatibility check', description: 'Checks packed provider conversion', inputParameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }, toolkit: { slug: 'compatibility', name: 'Compatibility' }, tags: [] };\nconst executeTool = async () => ({ data: {}, error: null, successful: true });\nfor (const [packageName, exportName, agentic] of providerContracts) {\n  const packageExports = await import(packageName);\n  const Provider = packageExports[exportName];\n  if (typeof Provider !== 'function') throw new Error(\`\${packageName} does not export \${exportName}\`);\n  const provider = new Provider();\n  const wrappedTool = provider.wrapTool(tool, ...(agentic ? [executeTool] : []));\n  if ((typeof wrappedTool !== 'object' || wrappedTool === null) && typeof wrappedTool !== 'function') throw new Error(\`\${packageName} did not wrap a minimal tool\`);\n}\nconst core = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./node_modules/@composio/core/package.json', import.meta.url), 'utf8'));\nconsole.log(\`${lane.id}: wrapped a tool with \${providerContracts.length} providers and @composio/core@\${core.version}\`);\n`
  );
  await writeFile(
    path.join(fixtureDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          // This aggregate fixture owns Composio's package boundary. Provider-specific
          // strict fixtures own upstream declaration compatibility so unrelated framework
          // internals cannot make every provider's packaging result unreadable.
          skipLibCheck: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['index.ts'],
      },
      null,
      2
    )}\n`
  );
}

async function runLane(
  lane: CompatibilityLane,
  allProviders: ProviderCompatibilityCase[],
  tarballs: Map<string, string>,
  runDirectory: string
): Promise<void> {
  const providers = lane.providerNames.map(name => {
    const provider = allProviders.find(candidate => candidate.name === name);
    if (!provider) throw new Error(`Unknown provider in compatibility plan: ${name}`);
    return provider;
  });
  const fixtureDirectory = path.join(runDirectory, lane.id);
  await mkdir(fixtureDirectory, { recursive: true });
  await writeConsumerFixture(fixtureDirectory, lane, providers, tarballs);

  const installArgs = [
    'install',
    ...(lane.lifecycleScripts === 'skip' ? ['--ignore-scripts'] : []),
    '--package-lock=false',
    '--no-audit',
    '--no-fund',
  ];
  console.log(
    `${lane.id}: installing ${providers.length} packed provider package(s), lifecycle scripts: ${lane.lifecycleScripts}`
  );
  run(npmBin, installArgs, fixtureDirectory);
  run(path.join(fixtureDirectory, 'node_modules/.bin/tsc'), ['--noEmit'], fixtureDirectory);
  const result = run(process.execPath, ['index.mjs'], fixtureDirectory);
  console.log(result);
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const providers = await discoverProviderCases();
  const plan = buildCompatibilityPlan(providers).filter(lane =>
    options.lanes.has(laneCategory(lane))
  );
  const prereleaseLane = plan.find(lane => lane.core.kind === 'workspace-prerelease');
  const prereleaseVersion =
    prereleaseLane?.core.kind === 'workspace-prerelease'
      ? prereleaseLane.core.version
      : process.env.COMPOSIO_CORE_PRERELEASE_VERSION || '1.0.0-beta.0';

  if (options.planOnly) {
    console.log(JSON.stringify({ providers, lanes: plan }, null, 2));
    return;
  }

  const deferredFloorCorrections = providers.filter(
    provider => provider.advertisedMinimumCoreVersion !== provider.verifiedMinimumCoreVersion
  );
  if (deferredFloorCorrections.length > 0) {
    console.log(
      `Using verified core floors without changing published 0.x ranges: ${deferredFloorCorrections
        .map(
          provider =>
            `${provider.name} ${provider.advertisedMinimumCoreVersion}→${provider.verifiedMinimumCoreVersion}`
        )
        .join(', ')}`
    );
  }

  const runDirectory = await mkdtemp(path.join(tmpdir(), 'composio-provider-compatibility-'));
  try {
    const artifactDirectory = path.join(runDirectory, 'artifacts');
    await mkdir(artifactDirectory, { recursive: true });
    const tarballs = await packWorkspaceArtifacts(providers, artifactDirectory, prereleaseVersion);

    console.log(
      `Checking ${providers.length} providers across ${plan.length} compatibility lanes...`
    );
    const failures: string[] = [];
    for (const lane of plan) {
      try {
        await runLane(lane, providers, tarballs, runDirectory);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${lane.id}: failed\n${message}`);
        failures.push(lane.id);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Provider compatibility failed in ${failures.length} lane(s): ${failures.join(', ')}`
      );
    }
    console.log('Packed provider compatibility checks passed.');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entrypoint) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
