/**
 * Runtime-neutral helpers for normalizing user-provided filesystem paths.
 *
 * In filesystem-less runtimes (Cloudflare Workers, etc.) these are no-ops.
 */

function safeHomedir(): string | null {
  try {
    // Lazy require to keep this module importable from browser/Workers bundles.
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const os = require('node:os');
    return os.homedir?.() ?? null;
  } catch {
    return null;
  }
}

function safePathModule(): {
  resolve: (...p: string[]) => string;
  join: (...p: string[]) => string;
  isAbsolute: (p: string) => boolean;
} | null {
  try {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    return require('node:path');
  } catch {
    return null;
  }
}

/**
 * Expands a leading `~` to the user's home directory and resolves to an
 * absolute path. Returns the input unchanged when node's `path`/`os` modules
 * are unavailable.
 */
export function expandHomeAndResolve(p: string | undefined): string | undefined {
  if (!p) return p;
  const pathMod = safePathModule();
  if (!pathMod) return p;
  let expanded = p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    const home = safeHomedir();
    if (home) {
      expanded = p === '~' ? home : pathMod.join(home, p.slice(2));
    }
  }
  return pathMod.resolve(expanded);
}

/**
 * Applies {@link expandHomeAndResolve} to each entry, dropping empty/invalid
 * values. Preserves `undefined` and `false` (so downstream can distinguish
 * "user did not configure" from "user explicitly disabled local uploads"
 * from "user configured []").
 */
export function expandHomeAndResolveMany<T extends string[] | false | undefined>(
  list: T
): T extends false ? false : T extends undefined ? undefined : string[] {
  if (list === undefined) return undefined as never;
  if (list === false) return false as never;
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const resolved = expandHomeAndResolve(raw);
    if (resolved) out.push(resolved);
  }
  return out as never;
}

/**
 * Absolute path of the default upload staging directory
 * (`<home>/.composio/temp`), or `null` when a home directory is unavailable
 * (e.g. Cloudflare Workers).
 */
export function getDefaultUploadDir(): string | null {
  const home = safeHomedir();
  const pathMod = safePathModule();
  if (!home || !pathMod) return null;
  return pathMod.resolve(pathMod.join(home, '.composio', 'temp'));
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
