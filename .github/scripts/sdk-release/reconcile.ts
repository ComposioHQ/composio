import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ArtifactSchema,
  PackageSchema,
  RegistryObservationSchema,
  type RegistryObservation,
  type ReleaseArtifact,
  type ReleasePackage,
} from './contracts';
import { sealManifest } from './manifest';
import { digestBytes, inspectNpmPackage } from './registry/npm';
import { inspectPyPiPackage } from './registry/pypi';
export { RegistryConsistencyTimeoutError, verifyRegistryConsistency } from './verify';

const ManifestIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReconciliationPlanSchema = z
  .object({
    schema_version: z.literal('sdk-release-reconciliation/v1'),
    manifest_id: ManifestIdSchema,
    can_publish: z.boolean(),
    observations: z.array(RegistryObservationSchema),
    absent: z
      .object({
        npm: z.array(z.string().min(1)),
        pypi: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

export type ReconciliationPlan = z.infer<typeof ReconciliationPlanSchema>;

function validateReleaseSet(
  packages: readonly ReleasePackage[],
  artifacts: readonly ReleaseArtifact[]
): { packages: ReleasePackage[]; artifacts: ReleaseArtifact[] } {
  const parsedPackages = packages.map(releasePackage => PackageSchema.parse(releasePackage));
  const parsedArtifacts = artifacts.map(artifact => ArtifactSchema.parse(artifact));
  if (parsedPackages.length === 0) throw new Error('release reconciliation requires packages');
  const identities = new Set<string>();
  for (const releasePackage of parsedPackages) {
    const identity = `${releasePackage.registry}:${releasePackage.name}@${releasePackage.version}`;
    if (identities.has(identity)) throw new Error(`duplicate release package ${identity}`);
    identities.add(identity);
    const packageArtifacts = parsedArtifacts.filter(
      artifact => artifact.package_name === releasePackage.name
    );
    if (releasePackage.ecosystem === 'typescript' && packageArtifacts.length !== 1) {
      throw new Error(`npm package ${releasePackage.name} requires exactly one sealed tarball`);
    }
    if (releasePackage.ecosystem === 'python' && packageArtifacts.length === 0) {
      throw new Error(`PyPI package ${releasePackage.name} requires sealed distributions`);
    }
  }
  const orphan = parsedArtifacts.find(
    artifact =>
      !parsedPackages.some(releasePackage => releasePackage.name === artifact.package_name)
  );
  if (orphan) throw new Error(`orphan sealed artifact ${orphan.filename}`);
  return { packages: parsedPackages, artifacts: parsedArtifacts };
}

export interface ReconcileReleaseOptions {
  manifest_id: string;
  packages: readonly ReleasePackage[];
  artifacts: readonly ReleaseArtifact[];
  fetch?: typeof globalThis.fetch;
  now?: () => string;
  npm_registry_url?: string;
  pypi_registry_url?: string;
}

export async function reconcileRelease(
  options: ReconcileReleaseOptions
): Promise<ReconciliationPlan> {
  const manifestId = ManifestIdSchema.parse(options.manifest_id);
  const releaseSet = validateReleaseSet(options.packages, options.artifacts);
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const observations: RegistryObservation[] = await Promise.all(
    releaseSet.packages.map(releasePackage => {
      const artifacts = releaseSet.artifacts.filter(
        artifact => artifact.package_name === releasePackage.name
      );
      return releasePackage.ecosystem === 'typescript'
        ? inspectNpmPackage({
            manifest_id: manifestId,
            release_package: releasePackage,
            artifacts,
            fetch: fetcher,
            now,
            registry_url: options.npm_registry_url,
          })
        : inspectPyPiPackage({
            manifest_id: manifestId,
            release_package: releasePackage,
            artifacts,
            fetch: fetcher,
            now,
            registry_url: options.pypi_registry_url,
          });
    })
  );
  const hasConflict = observations.some(observation => observation.state === 'conflict');
  const absent = hasConflict
    ? { npm: [], pypi: [] }
    : {
        npm: observations
          .filter(observation => observation.registry === 'npm' && observation.state === 'absent')
          .flatMap(observation =>
            releaseSet.artifacts
              .filter(artifact => artifact.package_name === observation.package_name)
              .map(artifact => artifact.filename)
          ),
        pypi: observations
          .filter(observation => observation.registry === 'pypi' && observation.state === 'absent')
          .flatMap(observation =>
            releaseSet.artifacts
              .filter(artifact => artifact.package_name === observation.package_name)
              .map(artifact => artifact.filename)
          ),
      };
  return ReconciliationPlanSchema.parse({
    schema_version: 'sdk-release-reconciliation/v1',
    manifest_id: manifestId,
    can_publish: !hasConflict,
    observations,
    absent,
  });
}

function verifyArtifactFile(path: string, artifact: ReleaseArtifact): void {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`sealed artifact is missing: ${artifact.filename}`);
  }
  const digest = digestBytes(readFileSync(path));
  if (
    digest.sha256 !== artifact.sha256 ||
    (artifact.ecosystem === 'typescript' && digest.integrity !== artifact.integrity)
  ) {
    throw new Error(`sealed digest mismatch for ${artifact.filename}`);
  }
}

export function verifySealedArtifactDirectory(
  artifacts: readonly ReleaseArtifact[],
  sourceDirectory: string
): void {
  for (const artifact of artifacts.map(candidate => ArtifactSchema.parse(candidate))) {
    verifyArtifactFile(join(sourceDirectory, artifact.filename), artifact);
  }
}

export interface FilterAbsentArtifactsOptions {
  plan: ReconciliationPlan;
  artifacts: readonly ReleaseArtifact[];
  source_directory: string;
  output_directory: string;
}

export function filterAbsentArtifacts(options: FilterAbsentArtifactsOptions): {
  npm: string[];
  pypi: string[];
} {
  const plan = ReconciliationPlanSchema.parse(options.plan);
  if (
    !plan.can_publish ||
    plan.observations.some(observation => observation.state === 'conflict')
  ) {
    throw new Error('registry conflict freezes every artifact handoff');
  }
  const artifacts = options.artifacts.map(artifact => ArtifactSchema.parse(artifact));
  const selectedNames = new Set([...plan.absent.npm, ...plan.absent.pypi]);
  const missing = [...selectedNames].find(
    filename => !artifacts.some(artifact => artifact.filename === filename)
  );
  if (missing) throw new Error(`reconciliation selected unknown artifact ${missing}`);

  const outputs = { npm: [] as string[], pypi: [] as string[] };
  for (const registry of ['npm', 'pypi'] as const) {
    for (const filename of plan.absent[registry]) {
      const artifact = artifacts.find(candidate => candidate.filename === filename);
      if (!artifact || artifact.registry !== registry) {
        throw new Error(`artifact ${filename} does not belong to ${registry}`);
      }
      verifyArtifactFile(join(options.source_directory, filename), artifact);
    }
  }
  for (const registry of ['npm', 'pypi'] as const) {
    const directory = join(options.output_directory, registry);
    mkdirSync(directory, { recursive: true });
    for (const filename of plan.absent[registry]) {
      const artifact = artifacts.find(candidate => candidate.filename === filename);
      if (!artifact || artifact.registry !== registry) throw new Error(`invalid ${registry} plan`);
      const source = join(options.source_directory, filename);
      const destination = join(directory, filename);
      if (existsSync(destination)) {
        throw new Error(`filtered artifact destination already exists: ${filename}`);
      }
      copyFileSync(source, destination);
      verifyArtifactFile(destination, artifact);
      outputs[registry].push(destination);
    }
  }
  return outputs;
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const manifestPath = argumentValue(args, '--manifest');
  const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sealed = sealManifest(rawManifest);
  const plan = await reconcileRelease({
    manifest_id: sealed.manifest_id,
    packages: sealed.manifest.packages,
    artifacts: sealed.manifest.artifacts,
  });
  const outputPath = argumentValue(args, '--output');
  writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  if (
    plan.can_publish &&
    (args.includes('--artifact-directory') || args.includes('--filtered-directory'))
  ) {
    filterAbsentArtifacts({
      plan,
      artifacts: sealed.manifest.artifacts,
      source_directory: argumentValue(args, '--artifact-directory'),
      output_directory: argumentValue(args, '--filtered-directory'),
    });
  }
  if (!plan.can_publish) process.exitCode = 2;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
