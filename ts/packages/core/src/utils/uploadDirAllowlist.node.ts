/**
 * Allowlist for automatic file upload during tool execution.
 *
 * This is only consulted when `dangerouslyAllowAutoUploadDownloadFiles` is enabled.
 * Manual `composio.files.upload()` calls are not subject to the allowlist.
 *
 * - A local path is accepted iff its real (symlink-resolved, absolute) path is
 *   inside one of the allowed directories on a path-component boundary.
 *   `/tmp/foo` allows `/tmp/foo/bar` but NOT `/tmp/foo-bar`.
 * - URLs (`http(s)://…`) and `File`/`Blob` values never hit this check.
 * - User-provided `fileUploadDirs` fully replaces the default `[~/.composio/temp]`.
 * - On Windows, path comparisons are case-insensitive.
 */
import * as path from 'node:path';
import fs from 'node:fs';
import {
  ComposioFileUploadPathNotAllowedError,
  ComposioFileNotFoundError,
} from '../errors/FileModifierErrors';

/**
 * Ensures the given directory exists (best-effort, non-throwing). Safe to call
 * during SDK init; allowlist enforcement still works even if creation fails.
 */
export function ensureDirExists(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function normalizeForCompare(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * True if `child` is equal to `parent` or nested inside it on a component
 * boundary. Assumes both paths are absolute and normalized.
 */
function isInsideDir(child: string, parent: string): boolean {
  const a = normalizeForCompare(child);
  const b = normalizeForCompare(parent);
  if (a === b) return true;
  const sep = path.sep;
  const bWithSep = b.endsWith(sep) ? b : b + sep;
  return a.startsWith(bWithSep);
}

/**
 * Returns the real (symlink-resolved) absolute path when the target exists,
 * else `null`. Mirrors the semantics of the sensitive-path util.
 */
function tryRealpath(absPath: string): string | null {
  try {
    if (fs.existsSync(absPath)) {
      return fs.realpathSync(absPath);
    }
  } catch {
    // ignore and fall through
  }
  return null;
}

function formatAllowlist(dirs: string[]): string {
  if (dirs.length === 0) return '  (none configured \u2014 all local paths are blocked)';
  return dirs.map(d => `  - ${d}`).join('\n');
}

function buildHelpFooter(allowlist: string[]): string {
  return [
    '',
    'Allowed upload directories (fileUploadDirs):',
    formatAllowlist(allowlist),
    '',
    'Fix one of the following:',
    '',
    '  1. Recommended \u2014 move the file under an allowed directory, or add your',
    '     directory to the allowlist:',
    '       new Composio({',
    "         fileUploadDirs: ['/abs/path/to/uploads', '~/.composio/temp'],",
    '       })',
    '     Note: user-provided `fileUploadDirs` REPLACES the default',
    '     `~/.composio/temp`. Include it explicitly if you want staged uploads',
    '     to keep working.',
    '',
    '  2. Pass the file by URL or as a File/Blob object instead of a filesystem',
    '     path. URLs and File objects are never path-checked.',
    '',
    '  3. (Dangerous) Bypass the allowlist entirely by opting into automatic',
    '     file upload/download from any readable path:',
    '       new Composio({ dangerouslyAllowAutoUploadDownloadFiles: true })',
    '     WARNING: This lets a prompt-injected or misbehaving tool read ANY',
    '     file the process can access. Only enable it in trusted, sandboxed',
    '     environments. The built-in sensitive-path denylist (.ssh, .aws,',
    '     .env, private SSH keys, etc.) still applies unless you also set',
    '     `sensitiveFileUploadProtection: false`.',
  ].join('\n');
}

/**
 * @throws {ComposioFileNotFoundError} when `filePath` does not exist on disk.
 * @throws {ComposioFileUploadPathNotAllowedError} when the resolved path is
 *         outside every entry of `allowlist`.
 */
export function assertPathInsideUploadDirs(filePath: string, allowlist: string[]): void {
  const attempted = filePath;
  const abs = path.resolve(filePath);
  const real = tryRealpath(abs);

  if (!real) {
    const cwd = process.cwd();
    const parent = path.dirname(abs);
    const parentExists = (() => {
      try {
        return fs.existsSync(parent);
      } catch {
        return false;
      }
    })();

    throw new ComposioFileNotFoundError(
      [
        `Refusing to auto-upload "${attempted}": the file does not exist on disk.`,
        '',
        `Path attempted:   ${attempted}`,
        `Resolved to:      ${abs}`,
        `Process cwd:      ${cwd}`,
        `Parent exists:    ${parentExists ? 'yes (' + parent + ')' : 'no (' + parent + ')'}`,
        '',
        'Common causes:',
        '  - Typo in the filename passed to the tool.',
        '  - Relative path resolved against the wrong working directory',
        '    (relative paths use process.cwd() at the moment of upload).',
        '  - File was deleted between the tool being called and the upload starting.',
        '',
        buildHelpFooter(allowlist),
      ].join('\n'),
      { meta: { attempted, resolved: abs, cwd, allowlist } }
    );
  }

  if (allowlist.length === 0) {
    throw new ComposioFileUploadPathNotAllowedError(
      [
        `Refusing to auto-upload "${attempted}": no upload directories are configured.`,
        '',
        `Path attempted:   ${attempted}`,
        `Resolved to:      ${real}`,
        '',
        'Automatic file upload during tool execution is locked down by default',
        'to prevent a prompt-injected tool from exfiltrating server files',
        '(source code, .env, SSH keys, etc.).',
        buildHelpFooter(allowlist),
      ].join('\n'),
      { meta: { attempted, resolved: real, allowlist } }
    );
  }

  for (const dir of allowlist) {
    const realDir = tryRealpath(dir) ?? path.resolve(dir);
    if (isInsideDir(real, realDir)) {
      return;
    }
  }

  throw new ComposioFileUploadPathNotAllowedError(
    [
      `Refusing to auto-upload "${attempted}": resolved path is not inside any`,
      'directory in the configured `fileUploadDirs` allowlist.',
      '',
      `Path attempted:   ${attempted}`,
      `Resolved to:      ${real}`,
      buildHelpFooter(allowlist),
    ].join('\n'),
    { meta: { attempted, resolved: real, allowlist } }
  );
}
