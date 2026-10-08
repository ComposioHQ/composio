import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Integrity verification for tarballs this repo downloads outside of pnpm.
 *
 * `pnpm install --frozen-lockfile` verifies every dependency it installs
 * against the `integrity` recorded in `pnpm-lock.yaml`. A tarball fetched by a
 * build script gets none of that: the script asks the registry where the bytes
 * live and writes whatever comes back. The codex-acp binaries are fetched that
 * way — they must be present for all four platforms on a single-platform runner,
 * which pnpm will not install — and they are then packaged, executable, inside
 * the published CLI release archive.
 *
 * The lockfile already carries the expected hash for exactly those packages, so
 * the fix is to use it. Verification is fail-closed: a package with no lockfile
 * entry, or a lockfile that cannot be found, aborts the build rather than
 * shipping unverified bytes.
 */

const LOCKFILE_NAME = 'pnpm-lock.yaml';

/** `  '@scope/name@1.2.3':` or `  name@1.2.3:` at the top level of `packages:`. */
const PACKAGE_KEY_PATTERN = /^ {2}(?:'(.+)'|([^\s'][^\s]*?)):$/;

/** `integrity: sha512-…` inside a `resolution: { … }` mapping. */
const INTEGRITY_PATTERN = /^\s+resolution:\s*\{[^}]*\bintegrity:\s*(sha\d{3}-[A-Za-z0-9+/=]+)/;

export class TarballIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TarballIntegrityError';
  }
}

/**
 * Maps every `name@version` in a pnpm lockfile to its recorded integrity hash.
 *
 * Deliberately line-based rather than a YAML parse: the lockfile is large, the
 * shape being read is two adjacent lines, and this keeps the build script free
 * of a YAML dependency. Entries whose `resolution` carries no `integrity` — git
 * and direct-tarball resolutions — are skipped, so asking for one fails closed
 * in `expectedIntegrityFor` instead of silently passing.
 */
export const parseLockfileIntegrity = (lockfileText: string): ReadonlyMap<string, string> => {
  const integrityByPackage = new Map<string, string>();
  const lines = lockfileText.split('\n');

  for (let index = 0; index < lines.length - 1; index += 1) {
    const keyMatch = PACKAGE_KEY_PATTERN.exec(lines[index] ?? '');
    if (!keyMatch) {
      continue;
    }

    const integrityMatch = INTEGRITY_PATTERN.exec(lines[index + 1] ?? '');
    if (!integrityMatch) {
      continue;
    }

    const packageKey = keyMatch[1] ?? keyMatch[2];
    const integrity = integrityMatch[1];
    if (packageKey && integrity && !integrityByPackage.has(packageKey)) {
      integrityByPackage.set(packageKey, integrity);
    }
  }

  return integrityByPackage;
};

/**
 * The integrity hash the lockfile pins for `packageName@version`.
 *
 * Throws when the package is absent: a build script that downloads something
 * the lockfile never resolved has no pinned bytes to check against, which is
 * the situation this module exists to refuse.
 */
export const expectedIntegrityFor = (
  integrityByPackage: ReadonlyMap<string, string>,
  packageName: string,
  version: string
): string => {
  const packageKey = `${packageName}@${version}`;
  const integrity = integrityByPackage.get(packageKey);

  if (!integrity) {
    throw new TarballIntegrityError(
      `${packageKey} has no integrity hash in ${LOCKFILE_NAME}; refusing to package unverified bytes.`
    );
  }

  return integrity;
};

/** Lockfile hash prefix to the Web Crypto algorithm name that computes it. */
const SUBTLE_ALGORITHM_BY_PREFIX: Readonly<Record<string, string>> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

/** Subresource-integrity string for `bytes` under the given lockfile prefix. */
const computeIntegrity = async (bytes: Uint8Array, prefix: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    SUBTLE_ALGORITHM_BY_PREFIX[prefix] as string,
    bytes as BufferSource
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `${prefix}-${base64}`;
};

/**
 * Throws unless `bytes` hashes to `expectedIntegrity`.
 *
 * The algorithm is read from the expected value so a lockfile that moves off
 * sha512 keeps working, and an unrecognised one fails loudly here rather than
 * comparing two strings that could never match.
 */
export const assertBytesMatchIntegrity = async (
  bytes: Uint8Array,
  expectedIntegrity: string,
  label: string
): Promise<void> => {
  const prefix = expectedIntegrity.split('-')[0] ?? '';
  if (!(prefix in SUBTLE_ALGORITHM_BY_PREFIX)) {
    throw new TarballIntegrityError(
      `Unsupported integrity algorithm for ${label}: "${expectedIntegrity}".`
    );
  }

  const actualIntegrity = await computeIntegrity(bytes, prefix);

  if (actualIntegrity !== expectedIntegrity) {
    throw new TarballIntegrityError(
      `Integrity mismatch for ${label}.\n  Expected: ${expectedIntegrity}\n  Actual:   ${actualIntegrity}`
    );
  }
};

/**
 * Nearest `pnpm-lock.yaml` at or above `startDir`.
 *
 * Walks up rather than resolving a fixed `../../..` so the script keeps working
 * from whichever directory a build or test invokes it in.
 */
export const findLockfilePath = async (startDir: string): Promise<string> => {
  let directory = path.resolve(startDir);

  for (;;) {
    const candidate = path.join(directory, LOCKFILE_NAME);
    const found = await stat(candidate)
      .then(stats => stats.isFile())
      .catch(() => false);

    if (found) {
      return candidate;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new TarballIntegrityError(
        `Could not find ${LOCKFILE_NAME} at or above ${startDir}; cannot verify downloaded tarballs.`
      );
    }
    directory = parent;
  }
};

/** Lockfile integrity map for the workspace containing `startDir`. */
export const loadLockfileIntegrity = async (
  startDir: string
): Promise<ReadonlyMap<string, string>> =>
  parseLockfileIntegrity(await readFile(await findLockfilePath(startDir), 'utf8'));
