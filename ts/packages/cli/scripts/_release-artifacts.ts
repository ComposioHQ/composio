/**
 * Published artifact names and the companion paths included in every archive.
 *
 * Deliberately free of Bun-only imports so the packaging rules stay unit-testable
 * under Node.
 */

import { RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS } from '../src/services/run-companion-modules';

/**
 * Known binary artifact names (without extension).
 */
export const ARTIFACT_NAMES: ReadonlyArray<string> = [
  'composio-darwin-aarch64',
  'composio-darwin-x64',
  'composio-linux-x64',
  'composio-linux-aarch64',
];

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
