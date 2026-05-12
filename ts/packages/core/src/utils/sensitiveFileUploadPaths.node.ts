/**
 * Blocks accidental upload of local files from well-known secret/credential locations
 * during auto file upload (and {@link getFileDataAfterUploadingToS3}).
 */
import * as path from 'node:path';
import fs from 'node:fs';
import { ComposioSensitiveFilePathBlockedError } from '../errors/FileModifierErrors';

/**
 * Path segments (a single path component) that indicate a sensitive directory when
 * they appear anywhere in a resolved local path. Compared case-insensitively on Windows.
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

/**
 * Returns normalized path segments, resolving symlinks when the path exists.
 */
function normalizePathSegments(filePath: string): string[] {
  const absolute = path.resolve(filePath);
  let resolved = absolute;
  try {
    if (fs.existsSync(absolute)) {
      resolved = fs.realpathSync(absolute);
    }
  } catch {
    // If realpath fails (e.g. race), use resolved path
  }
  return resolved.split(/[/\\]+/).filter(Boolean);
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
  const segments = normalizePathSegments(filePath);
  const isWin = process.platform === 'win32';
  const deny = new Set(
    [
      ...BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS,
      ...(additionalDenySegments ?? []).map(s => s.trim()).filter(Boolean),
    ].map(s => (isWin ? s.toLowerCase() : s))
  );

  // Windows: compare segments case-insensitively; map once instead of toLowerCase per iteration.
  const segmentsForMatch = isWin ? segments.map(s => s.toLowerCase()) : segments;
  for (let i = 0; i < segments.length; i++) {
    if (deny.has(segmentsForMatch[i]!)) {
      return `path segment "${segments[i]}" is in the sensitive file upload denylist`;
    }
  }

  const basename = segments.length > 0 ? segments[segments.length - 1] : '';
  if (basename) {
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
 * @throws {ComposioSensitiveFilePathBlockedError} if the path is not allowed
 */
export function assertSafeFileUploadPath(
  filePath: string,
  options?: { additionalDenySegments?: string[] }
): void {
  const reason = getSensitiveFileUploadPathBlockReason(filePath, options?.additionalDenySegments);
  if (reason) {
    throw new ComposioSensitiveFilePathBlockedError(
      `Refusing to upload: ${reason}. ` +
        `To upload from this path anyway, set sensitiveFileUploadProtection: false on Composio ` +
        `(not recommended) or use a copy outside sensitive locations.`,
      { meta: { filePath, reason } }
    );
  }
}
