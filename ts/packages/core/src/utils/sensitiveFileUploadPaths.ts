/**
 * Blocks accidental upload of local files from well-known secret/credential locations
 * during auto file upload (and {@link getFileDataAfterUploadingToS3}).
 *
 * This is the single canonical guard shared by the core SDK and downstream
 * packages (e.g. `@composio/cli`). Filesystem access goes through the `#platform`
 * abstraction so this module stays free of static `node:*` imports and is safe to
 * re-export from the package root (edge/workerd builds included).
 */
import { platform } from '#platform';
import { ComposioSensitiveFilePathBlockedError } from '../errors/FileModifierErrors';

/**
 * Path segments (a single path component) that indicate a sensitive directory when
 * they appear anywhere in a resolved local path. Matching follows the case sensitivity
 * of the filesystem containing that path.
 */
export const BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS: readonly string[] = [
  '.ssh',
  '.aws',
  '.azure',
  '.gnupg',
  '.kube',
  '.docker',
  '.claude', // may contain API keys and project context read by assistants
  '.password-store',
  'keychains', // e.g. ~/Library/Keychains
];

const SECRET_LIKE_BASENAME = /^(\.env(\.|$)|\.netrc$|\.pgpass$)/i;
/** Default SSH private key basenames (public keys like id_rsa.pub are allowed). */
const DEFAULT_PRIVATE_KEY_BASENAME = /^id_(rsa|ed25519|ecdsa|dsa|ecdsa_sk)(\.old)?$/i;

const splitSegments = (aPath: string): string[] => aPath.split(/[/\\]+/).filter(Boolean);

/**
 * Returns normalized path segments, resolving symlinks when the path exists.
 *
 * Both the written path and the symlink-resolved one are returned, because a
 * denied segment can be hidden by a symlink in either direction:
 *
 *   - `~/innocent-name` -> `~/nested/.aws/creds` hides `.aws` from the written
 *     path, so the denylist has to see the resolved one.
 *   - `~/.claude` -> `/state/claude` hides `.claude` from the *resolved* path,
 *     so the denylist also has to see the written one. Dotfile managers
 *     (chezmoi, stow, yadm) and containerised home directories produce exactly
 *     this layout.
 *
 * Matching only the resolved path silently turns the denylist off for the
 * second case.
 */
function normalizePath(filePath: string): {
  resolvedPath: string;
  segments: string[];
  writtenSegments: string[];
} {
  const absolute = platform.resolvePath(filePath);
  let resolved = absolute;
  try {
    if (platform.existsSync(absolute)) {
      resolved = platform.realpathSync(absolute);
    }
  } catch {
    // If realpath fails (e.g. race), use resolved path
  }
  return {
    resolvedPath: resolved,
    segments: splitSegments(resolved),
    writtenSegments: splitSegments(absolute),
  };
}

/**
 * True if the path is under a built-in or extra deny segment, or the basename
 * looks like an env / netrc / default SSH private key name.
 */
export function isBlockedSensitiveFileUploadPath(
  filePath: string,
  additionalDenySegments?: string[]
): boolean {
  return getSensitiveFileUploadPathBlockReason(filePath, additionalDenySegments) != null;
}

function getSensitiveFileUploadPathBlockReason(
  filePath: string,
  additionalDenySegments?: string[]
): string | null {
  const { resolvedPath, segments, writtenSegments } = normalizePath(filePath);
  const isCaseSensitive = platform.isFileSystemCaseSensitive?.(resolvedPath) ?? true;
  const normalizeSegment = (segment: string) => (isCaseSensitive ? segment : segment.toLowerCase());
  const deny = new Set(
    [
      ...BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS,
      ...(additionalDenySegments ?? []).map(s => s.trim()).filter(Boolean),
    ].map(normalizeSegment)
  );

  for (const candidate of [segments, writtenSegments]) {
    const segmentsForMatch = isCaseSensitive ? candidate : candidate.map(normalizeSegment);
    for (let i = 0; i < candidate.length; i++) {
      if (deny.has(segmentsForMatch[i]!)) {
        return `path segment "${candidate[i]}" is in the sensitive file upload denylist`;
      }
    }
  }

  // Same two directions as the segment scan: `~/.env -> /state/config` hides a
  // denied basename from the resolved path, and a symlink pointing *at* a
  // credential file hides it from the written one.
  const basenames = [segments.at(-1), writtenSegments.at(-1)].filter(
    (name): name is string => !!name
  );
  for (const basename of basenames) {
    if (SECRET_LIKE_BASENAME.test(basename) || DEFAULT_PRIVATE_KEY_BASENAME.test(basename)) {
      return `file name "${basename}" looks like a credential, env, or private key file`;
    }
    if (basename.toLowerCase() === 'credentials') {
      return 'file name "credentials" is often used for cloud/API credential stores';
    }
  }
  return null;
}

/**
 * Default remediation hint appended to the block message. Assumes an SDK caller
 * that exposes `sensitiveFileUploadProtection`. Callers without such an opt-out
 * (e.g. `@composio/cli`) should pass their own `remediation` so the message does
 * not advertise an option the caller cannot honor.
 */
const DEFAULT_REMEDIATION =
  `To upload from this path anyway, set sensitiveFileUploadProtection: false on Composio ` +
  `(not recommended) or use a copy outside sensitive locations.`;

/**
 * @throws {ComposioSensitiveFilePathBlockedError} if the path is not allowed
 */
export function assertSafeFileUploadPath(
  filePath: string,
  options?: { additionalDenySegments?: string[]; remediation?: string }
): void {
  const reason = getSensitiveFileUploadPathBlockReason(filePath, options?.additionalDenySegments);
  if (reason) {
    const remediation = options?.remediation ?? DEFAULT_REMEDIATION;
    throw new ComposioSensitiveFilePathBlockedError(
      `Refusing to upload: ${reason}. ${remediation}`,
      {
        meta: { filePath, reason },
      }
    );
  }
}
