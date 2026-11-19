/**
 * Published artifact names and the companion paths included in every archive.
 *
 * Deliberately free of Bun-only imports so the packaging rules stay unit-testable
 * under Node.
 */

import { Schema } from 'effect';
import {
  RELEASE_MANIFEST_SCHEMA_VERSION,
  ReleaseManifest,
  RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS,
} from '../src/services/run-companion-modules';

/**
 * Every published platform: the Bun cross-compilation target and the artifact it produces.
 */
export const RELEASE_TARGETS = [
  { bunTarget: 'bun-darwin-arm64', artifact: 'composio-darwin-aarch64' },
  { bunTarget: 'bun-darwin-x64', artifact: 'composio-darwin-x64' },
  { bunTarget: 'bun-linux-x64', artifact: 'composio-linux-x64' },
  { bunTarget: 'bun-linux-arm64', artifact: 'composio-linux-aarch64' },
  { bunTarget: 'bun-windows-x64', artifact: 'composio-windows-x64' },
] as const;

export type ReleaseTarget = (typeof RELEASE_TARGETS)[number];

const isWindowsArtifact = (artifact: string): boolean => artifact.startsWith('composio-windows-');

/** File name of the compiled binary in `dist/binaries/`. */
export const compiledBinaryFileName = (artifact: string): string =>
  isWindowsArtifact(artifact) ? `${artifact}.exe` : artifact;

/** Name of the executable inside the published archive. */
export const archiveExecutableName = (artifact: string): string =>
  isWindowsArtifact(artifact) ? 'composio.exe' : 'composio';

export type ArchiveCompanionEntryKind = 'copy' | 'placeholder';

export type ArchiveCompanionEntry = {
  readonly relativePath: string;
  readonly kind: ArchiveCompanionEntryKind;
};

/**
 * Decide how each companion path enters an archive.
 *
 * The live companions are copied. The legacy paths are written as empty files:
 * the sub-agent helper they served is gone, but every stable CLI from 0.2.12 to
 * 0.4.2 verifies a downloaded upgrade package against those paths and refuses to
 * install one that is missing any of them, so omitting them breaks
 * `composio upgrade` for every client already in the field. That check looks at
 * existence only, and an empty wrapper imports nothing, so a placeholder
 * satisfies it at zero bytes and is never read.
 *
 * Once no supported client performs that check, placeholders can become plain
 * omissions.
 */
export const archiveCompanionEntries = (
  liveRelativePaths: ReadonlyArray<string>
): ReadonlyArray<ArchiveCompanionEntry> => [
  ...liveRelativePaths.map(relativePath => ({ relativePath, kind: 'copy' as const })),
  ...RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS.map(relativePath => ({
    relativePath,
    kind: 'placeholder' as const,
  })),
];

/**
 * The earliest CLI version a manifest-aware client may upgrade from to an archive
 * built today. It starts at the oldest published release, so no client is refused.
 *
 * Raise it when an archive drops a path that some client at or above it still
 * requires. Clients that predate manifests never read it, so it does not make
 * them accept a smaller archive: the legacy placeholders stay while it is at or
 * below 0.4.2, the last release that requires them.
 */
export const MINIMUM_UPGRADE_FROM = '0.1.26';

/**
 * The `release-manifest.json` every archive carries: the live companions, never
 * the legacy placeholders, which no current client needs. Decoded on the way out
 * so packaging cannot write a manifest the CLI would refuse.
 */
export const buildReleaseManifest = (liveRelativePaths: ReadonlyArray<string>): ReleaseManifest =>
  Schema.decodeUnknownSync(ReleaseManifest)({
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    minimumUpgradeFrom: MINIMUM_UPGRADE_FROM,
    companions: [...liveRelativePaths].sort(),
  });

export const serializeReleaseManifest = (manifest: ReleaseManifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`;
