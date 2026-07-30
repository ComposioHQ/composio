import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  RegistryObservationSchema,
  SealedManifestSchema,
  type RegistryObservation,
  type SealedManifest,
} from './contracts';
import { computeManifestId } from './manifest';

const WorkspacePackageSchema = z
  .object({
    name: z.string().min(1),
    dependencies: z.array(z.string().min(1)),
  })
  .strict();

export interface NpmPublicationItem {
  package_name: string;
  version: string;
  artifact_path: string;
  dist_tag: string;
}

export function planNpmPublication(options: {
  manifest: SealedManifest;
  observations: readonly RegistryObservation[];
  workspace_packages: Array<z.infer<typeof WorkspacePackageSchema>>;
  artifact_directory: string;
}): NpmPublicationItem[] {
  const manifest = SealedManifestSchema.parse(options.manifest);
  const observations = options.observations.map(observation =>
    RegistryObservationSchema.parse(observation)
  );
  const manifestId = computeManifestId(manifest);
  if (observations.some(observation => observation.manifest_id !== manifestId)) {
    throw new Error('Registry observations do not belong to the sealed manifest');
  }
  if (observations.some(observation => observation.state === 'conflict')) {
    throw new Error('Registry conflict blocks every npm publish operation');
  }
  const workspace = new Map(
    options.workspace_packages.map(item => {
      const parsed = WorkspacePackageSchema.parse(item);
      return [parsed.name, parsed] as const;
    })
  );
  const absent = new Set(
    observations
      .filter(observation => observation.registry === 'npm' && observation.state === 'absent')
      .map(observation => observation.package_name)
  );
  const selected = manifest.packages.filter(
    releasePackage => releasePackage.ecosystem === 'typescript'
  );
  for (const releasePackage of selected) {
    const matching = observations.filter(
      observation =>
        observation.registry === 'npm' && observation.package_name === releasePackage.name
    );
    if (matching.length !== 1) {
      throw new Error(`npm package ${releasePackage.name} requires one live registry observation`);
    }
    if (!workspace.has(releasePackage.name)) {
      throw new Error(`Missing workspace dependency metadata for ${releasePackage.name}`);
    }
  }

  const selectedNames = new Set(selected.map(releasePackage => releasePackage.name));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  const visit = (name: string): void => {
    if (visited.has(name) || !absent.has(name)) return;
    if (visiting.has(name)) throw new Error(`npm release dependency cycle contains ${name}`);
    visiting.add(name);
    const metadata = workspace.get(name);
    if (!metadata) throw new Error(`Missing workspace dependency metadata for ${name}`);
    for (const dependency of metadata.dependencies.sort()) {
      if (selectedNames.has(dependency)) visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  };
  for (const releasePackage of selected) visit(releasePackage.name);

  return ordered.map(name => {
    const releasePackage = selected.find(candidate => candidate.name === name);
    const artifact = manifest.artifacts.find(
      candidate => candidate.ecosystem === 'typescript' && candidate.package_name === name
    );
    if (!releasePackage || releasePackage.ecosystem !== 'typescript' || !artifact) {
      throw new Error(`Sealed npm artifact is missing for ${name}`);
    }
    return {
      package_name: name,
      version: releasePackage.version,
      artifact_path: join(options.artifact_directory, artifact.filename),
      dist_tag: releasePackage.dist_tag,
    };
  });
}

export async function executeNpmPublication(
  plan: readonly NpmPublicationItem[],
  publish: (args: string[]) => Promise<void> = async args => {
    const result = Bun.spawnSync(['npm', ...args], { stdout: 'inherit', stderr: 'inherit' });
    if (result.exitCode !== 0) throw new Error(`npm publish failed with exit ${result.exitCode}`);
  }
): Promise<void> {
  for (const item of plan) {
    await publish(['publish', item.artifact_path, '--tag', item.dist_tag, '--access', 'public']);
  }
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const manifest = JSON.parse(readFileSync(argumentValue(args, '--manifest'), 'utf8'));
  const reconciliation = JSON.parse(readFileSync(argumentValue(args, '--reconciliation'), 'utf8'));
  const workspace = JSON.parse(readFileSync(argumentValue(args, '--workspace'), 'utf8'));
  const plan = planNpmPublication({
    manifest,
    observations: reconciliation.observations,
    workspace_packages: workspace,
    artifact_directory: argumentValue(args, '--artifact-directory'),
  });
  await executeNpmPublication(plan);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
