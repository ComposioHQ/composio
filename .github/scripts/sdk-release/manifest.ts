import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json';
import {
  DraftManifestSchema,
  ManifestSchema,
  SealedManifestSchema,
  type ReleaseManifest,
  type SealedManifest,
} from './contracts';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export function normalizeManifest(manifest: ReleaseManifest): ReleaseManifest {
  return {
    ...manifest,
    packages: [...manifest.packages].sort(
      (left, right) =>
        compareText(left.ecosystem, right.ecosystem) ||
        compareText(left.name, right.name) ||
        compareText(left.version, right.version)
    ),
    artifacts: [...manifest.artifacts].sort(
      (left, right) =>
        compareText(left.filename, right.filename) ||
        compareText(left.package_name, right.package_name)
    ),
    changeset_ids: [...manifest.changeset_ids].sort(compareText),
    python_release_family: [...manifest.python_release_family].sort(compareText),
  };
}

export function canonicalManifestBytes(manifest: unknown): string {
  const parsed = ManifestSchema.parse(manifest);
  return canonicalJson(normalizeManifest(parsed));
}

export function computeManifestId(manifest: unknown): string {
  const sealed = SealedManifestSchema.parse(manifest);
  return createHash('sha256').update(canonicalManifestBytes(sealed), 'utf8').digest('hex');
}

export function sealManifest(manifest: unknown): {
  manifest: SealedManifest;
  canonical_bytes: string;
  manifest_id: string;
} {
  const candidate = ManifestSchema.parse(manifest);
  const sealed = SealedManifestSchema.parse({ ...candidate, phase: 'sealed' });
  const normalized = normalizeManifest(sealed) as SealedManifest;
  const canonical_bytes = canonicalJson(normalized);
  const manifest_id = createHash('sha256').update(canonical_bytes, 'utf8').digest('hex');
  return { manifest: normalized, canonical_bytes, manifest_id };
}

export function assertSealedManifestUnchanged(
  expectedManifestId: string,
  candidate: unknown
): SealedManifest {
  const sealed = SealedManifestSchema.parse(candidate);
  const actualManifestId = computeManifestId(sealed);
  if (actualManifestId !== expectedManifestId) {
    throw new Error(
      `Sealed manifest mutation detected: expected ${expectedManifestId}, received ${actualManifestId}`
    );
  }
  return sealed;
}

export function parseDraftManifest(manifest: unknown) {
  return DraftManifestSchema.parse(manifest);
}

export function parseSealedManifest(manifest: unknown) {
  return SealedManifestSchema.parse(manifest);
}
