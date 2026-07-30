import { z } from 'zod';
import {
  ArtifactSchema,
  PackageSchema,
  RegistryObservationSchema,
  type RegistryObservation,
  type ReleaseArtifact,
  type ReleasePackage,
} from '../contracts';
import { RegistryResponseError, checkedRegistryResponse, registryFetch } from './npm';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const PyPiReleaseSchema = z
  .object({
    info: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .passthrough(),
    urls: z.array(
      z
        .object({
          filename: z.string().min(1),
          digests: z.object({ sha256: Sha256Schema }).passthrough(),
          packagetype: z.enum(['bdist_wheel', 'sdist']),
        })
        .passthrough()
    ),
  })
  .passthrough();

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedProjectName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function checkedRegistryUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RegistryResponseError('pypi', 'registry URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new RegistryResponseError('pypi', 'registry URL must be credential-free HTTPS');
  }
  return url.href.replace(/\/$/, '');
}

async function parseRelease(response: Response): Promise<z.infer<typeof PyPiReleaseSchema>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RegistryResponseError('pypi', 'body is not JSON');
  }
  const parsed = PyPiReleaseSchema.safeParse(value);
  if (!parsed.success) {
    throw new RegistryResponseError('pypi', parsed.error.issues[0]?.message ?? 'schema mismatch');
  }
  return parsed.data;
}

export interface InspectPyPiOptions {
  manifest_id: string;
  release_package: ReleasePackage;
  artifacts: readonly ReleaseArtifact[];
  fetch: typeof globalThis.fetch;
  now: () => string;
  registry_url?: string;
}

export async function inspectPyPiPackage(
  options: InspectPyPiOptions
): Promise<RegistryObservation> {
  const releasePackage = PackageSchema.parse(options.release_package);
  if (releasePackage.ecosystem !== 'python') {
    throw new Error('inspectPyPiPackage requires a Python package');
  }
  const artifacts = options.artifacts
    .map(artifact => ArtifactSchema.parse(artifact))
    .filter(
      artifact => artifact.ecosystem === 'python' && artifact.package_name === releasePackage.name
    );
  if (artifacts.length === 0) {
    throw new Error(`PyPI package ${releasePackage.name} requires sealed wheels or an sdist`);
  }
  const expectedArtifacts = artifacts
    .map(artifact => ({ filename: artifact.filename, sha256: artifact.sha256 }))
    .sort((left, right) => compareText(left.filename, right.filename));
  const registryUrl = checkedRegistryUrl(options.registry_url ?? 'https://pypi.org');
  const response = await checkedRegistryResponse(
    'pypi',
    await registryFetch(
      'pypi',
      options.fetch,
      `${registryUrl}/pypi/${encodeURIComponent(releasePackage.name)}/${encodeURIComponent(releasePackage.version)}/json`
    ),
    { absent404: true }
  );
  if (response === 'absent') {
    return RegistryObservationSchema.parse({
      schema_version: 'sdk-release-registry-observation/v1',
      manifest_id: options.manifest_id,
      package_name: releasePackage.name,
      version: releasePackage.version,
      registry: 'pypi',
      state: 'absent',
      expected_dist_tag: null,
      observed_dist_tag: null,
      expected_artifacts: expectedArtifacts,
      observed_artifacts: [],
      observed_at: options.now(),
    });
  }

  const release = await parseRelease(response);
  const observedArtifacts = release.urls
    .map(file => ({ filename: file.filename, sha256: file.digests.sha256 }))
    .sort((left, right) => compareText(left.filename, right.filename));
  const state =
    normalizedProjectName(release.info.name) === normalizedProjectName(releasePackage.name) &&
    release.info.version === releasePackage.version &&
    JSON.stringify(observedArtifacts) === JSON.stringify(expectedArtifacts)
      ? 'exact'
      : 'conflict';
  return RegistryObservationSchema.parse({
    schema_version: 'sdk-release-registry-observation/v1',
    manifest_id: options.manifest_id,
    package_name: releasePackage.name,
    version: releasePackage.version,
    registry: 'pypi',
    state,
    expected_dist_tag: null,
    observed_dist_tag: null,
    expected_artifacts: expectedArtifacts,
    observed_artifacts: observedArtifacts,
    observed_at: options.now(),
  });
}
