import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ArtifactSchema,
  NpmIntegritySchema,
  PackageSchema,
  RegistryObservationSchema,
  SDK_RELEASE_REGISTRY_OBSERVATION_VERSION,
  type RegistryObservation,
  type ReleaseArtifact,
  type ReleasePackage,
} from '../contracts';

const NpmVersionDocumentSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    dist: z
      .object({
        tarball: z.string().url(),
        integrity: NpmIntegritySchema,
      })
      .passthrough(),
  })
  .passthrough();

const NpmPackumentSchema = z
  .object({
    name: z.string().min(1),
    'dist-tags': z.record(z.string(), z.string().min(1)),
  })
  .passthrough();

export class RegistryTransientError extends Error {
  constructor(
    readonly registry: 'npm' | 'pypi',
    readonly status?: number
  ) {
    super(
      `${registry} registry request is retryable${status === undefined ? '' : ` (HTTP ${status})`}`
    );
    this.name = 'RegistryTransientError';
  }
}

export class RegistryResponseError extends Error {
  constructor(
    readonly registry: 'npm' | 'pypi',
    detail: string
  ) {
    super(`Malformed ${registry} registry response: ${detail}`);
    this.name = 'RegistryResponseError';
  }
}

export async function registryFetch(
  registry: 'npm' | 'pypi',
  fetcher: typeof globalThis.fetch,
  input: string | URL
): Promise<Response> {
  try {
    return await fetcher(input);
  } catch {
    throw new RegistryTransientError(registry);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function checkedRegistryResponse(
  registry: 'npm' | 'pypi',
  response: Response,
  options: { absent404?: boolean } = {}
): Promise<'absent' | Response> {
  if (options.absent404 && response.status === 404) return 'absent';
  if (isRetryableStatus(response.status))
    throw new RegistryTransientError(registry, response.status);
  if (!response.ok) {
    throw new RegistryResponseError(registry, `unexpected HTTP ${response.status}`);
  }
  return response;
}

async function registryJson<T>(
  registry: 'npm' | 'pypi',
  response: Response,
  schema: z.ZodType<T>
): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RegistryResponseError(registry, 'body is not JSON');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RegistryResponseError(registry, parsed.error.issues[0]?.message ?? 'schema mismatch');
  }
  return parsed.data;
}

function npmPackagePath(name: string): string {
  return encodeURIComponent(name).replace(/^%40/, '@');
}

function checkedRegistryUrl(registry: 'npm' | 'pypi', rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RegistryResponseError(registry, 'registry URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new RegistryResponseError(registry, 'registry URL must be credential-free HTTPS');
  }
  return url.href.replace(/\/$/, '');
}

export function digestBytes(bytes: Uint8Array): { sha256: string; integrity: string } {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}

export interface InspectNpmOptions {
  manifest_id: string;
  release_package: ReleasePackage;
  artifacts: readonly ReleaseArtifact[];
  fetch: typeof globalThis.fetch;
  now: () => string;
  registry_url?: string;
}

export async function inspectNpmPackage(options: InspectNpmOptions): Promise<RegistryObservation> {
  const releasePackage = PackageSchema.parse(options.release_package);
  if (releasePackage.ecosystem !== 'typescript') {
    throw new Error('inspectNpmPackage requires a TypeScript package');
  }
  const artifacts = options.artifacts.map(artifact => ArtifactSchema.parse(artifact));
  if (
    artifacts.length !== 1 ||
    artifacts[0]?.ecosystem !== 'typescript' ||
    artifacts[0].package_name !== releasePackage.name
  ) {
    throw new Error(`npm package ${releasePackage.name} requires exactly one sealed tarball`);
  }
  const artifact = artifacts[0];
  const registryUrl = checkedRegistryUrl(
    'npm',
    options.registry_url ?? 'https://registry.npmjs.org'
  );
  const packagePath = npmPackagePath(releasePackage.name);
  const versionResponse = await checkedRegistryResponse(
    'npm',
    await registryFetch(
      'npm',
      options.fetch,
      `${registryUrl}/${packagePath}/${encodeURIComponent(releasePackage.version)}`
    ),
    { absent404: true }
  );
  const expectedArtifacts = [
    {
      filename: artifact.filename,
      sha256: artifact.sha256,
      integrity: artifact.integrity,
    },
  ];
  if (versionResponse === 'absent') {
    return RegistryObservationSchema.parse({
      schema_version: SDK_RELEASE_REGISTRY_OBSERVATION_VERSION,
      manifest_id: options.manifest_id,
      package_name: releasePackage.name,
      version: releasePackage.version,
      registry: 'npm',
      state: 'absent',
      expected_dist_tag: releasePackage.dist_tag,
      observed_dist_tag: null,
      expected_artifacts: expectedArtifacts,
      observed_artifacts: [],
      observed_at: options.now(),
    });
  }

  const versionDocument = await registryJson('npm', versionResponse, NpmVersionDocumentSchema);
  let tarballUrl: URL;
  try {
    tarballUrl = new URL(versionDocument.dist.tarball);
  } catch {
    throw new RegistryResponseError('npm', 'tarball URL is invalid');
  }
  if (tarballUrl.protocol !== 'https:' || tarballUrl.username || tarballUrl.password) {
    throw new RegistryResponseError('npm', 'tarball URL must be credential-free HTTPS');
  }
  if (tarballUrl.origin !== new URL(registryUrl).origin) {
    throw new RegistryResponseError('npm', 'tarball URL must remain on the configured registry');
  }

  const [packumentResponse, tarballResponse] = await Promise.all([
    registryFetch('npm', options.fetch, `${registryUrl}/${packagePath}`),
    registryFetch('npm', options.fetch, tarballUrl),
  ]);
  const checkedPackument = await checkedRegistryResponse('npm', packumentResponse);
  const checkedTarball = await checkedRegistryResponse('npm', tarballResponse);
  if (checkedPackument === 'absent' || checkedTarball === 'absent') {
    throw new RegistryTransientError('npm', 404);
  }
  const packument = await registryJson('npm', checkedPackument, NpmPackumentSchema);
  const tarballBytes = new Uint8Array(await checkedTarball.arrayBuffer());
  const observedDigest = digestBytes(tarballBytes);
  const observedTag =
    Object.entries(packument['dist-tags']).find(
      ([, version]) => version === releasePackage.version
    )?.[0] ?? null;
  const state =
    versionDocument.name === releasePackage.name &&
    versionDocument.version === releasePackage.version &&
    versionDocument.dist.integrity === artifact.integrity &&
    observedDigest.integrity === artifact.integrity &&
    observedDigest.sha256 === artifact.sha256 &&
    packument.name === releasePackage.name &&
    packument['dist-tags'][releasePackage.dist_tag] === releasePackage.version
      ? 'exact'
      : 'conflict';

  return RegistryObservationSchema.parse({
    schema_version: SDK_RELEASE_REGISTRY_OBSERVATION_VERSION,
    manifest_id: options.manifest_id,
    package_name: releasePackage.name,
    version: releasePackage.version,
    registry: 'npm',
    state,
    expected_dist_tag: releasePackage.dist_tag,
    observed_dist_tag: observedTag,
    expected_artifacts: expectedArtifacts,
    observed_artifacts: [
      {
        filename: artifact.filename,
        sha256: observedDigest.sha256,
        integrity: versionDocument.dist.integrity,
      },
    ],
    observed_at: options.now(),
  });
}
