/**
 * Runtime-neutral helpers for normalizing user-provided filesystem paths.
 *
 * In filesystem-less runtimes (Cloudflare Workers, etc.) the platform
 * abstraction reports `supportsFileSystem: false` and `homedir()` returns
 * `null`. We use that as the signal to drop unresolvable entries from the
 * allowlist (fail-closed) rather than silently passing `~/foo` through as
 * a literal directory name.
 */

import { platform } from '#platform';

/**
 * Expands a leading `~` to the user's home directory and resolves to an
 * absolute path. Returns `undefined` when expansion is required but no
 * home directory is available — that signals "unusable, drop me" to
 * {@link expandHomeAndResolveMany}, which is safer than letting the literal
 * `~/foo` survive as a CWD-relative path.
 */
export function expandHomeAndResolve(p: string | undefined): string | undefined {
  if (!p) return p;
  let expanded = p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    const home = platform.homedir();
    if (!home) return undefined;
    expanded = p === '~' ? home : platform.joinPath(home, p.slice(2));
  }
  return platform.resolvePath(expanded);
}

/**
 * Applies {@link expandHomeAndResolve} to each entry, dropping empty/invalid
 * values. Preserves `undefined` and `false` (so downstream can distinguish
 * "user did not configure" from "user explicitly disabled local uploads"
 * from "user configured []").
 */
export function expandHomeAndResolveMany(
  list: string[] | false | undefined
): string[] | false | undefined {
  if (list === undefined) return undefined;
  if (list === false) return false;
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const resolved = expandHomeAndResolve(raw);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * Absolute path of the default upload staging directory
 * (`<home>/.composio/temp`), or `null` when a home directory is unavailable
 * (e.g. Cloudflare Workers).
 */
export function getDefaultUploadDir(): string | null {
  const home = platform.homedir();
  if (!home) return null;
  return platform.resolvePath(platform.joinPath(home, '.composio', 'temp'));
}

/**
 * Resolve the effective upload allowlist for a given user-provided value.
 *
 * - `undefined` → `[<default>]` when a home directory is available, else `[]`
 *   (fail-closed if we can't derive the default staging dir).
 * - `false` → `[]` (explicit "reject all local paths"). URLs / File objects
 *   still work because they aren't path-checked.
 * - `string[]` (including `[]`) replaces the default and is returned
 *   verbatim after `~` expansion / `path.resolve`. `[]` is treated as
 *   equivalent to `false`.
 */
export function resolveEffectiveUploadAllowlist(userDirs: string[] | false | undefined): string[] {
  if (userDirs === undefined) {
    const def = getDefaultUploadDir();
    return def ? [def] : [];
  }
  if (userDirs === false) return [];
  const resolved = expandHomeAndResolveMany(userDirs);
  return Array.isArray(resolved) ? resolved : [];
}
