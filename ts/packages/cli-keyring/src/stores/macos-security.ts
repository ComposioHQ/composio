/**
 * macOS backend picker.
 *
 * The production CLI runs on Bun, so the FFI backend is the default
 * there — it's ~25× faster per read than the subprocess backend and
 * has no p99 tail. In Node environments (tests, dev tools that import
 * this package without Bun), `bun:ffi` is not available; we fall back
 * to the subprocess backend, which shells out to `/usr/bin/security`.
 *
 * Both backends expose the same `CredentialStore` interface so the
 * rest of the package is agnostic about which one is active.
 */

import type { CredentialStore } from '../core/store';
import { MacOSSecuritySubprocessStore } from './macos-security-subprocess';

/**
 * Backend selector for `createMacOSStore`.
 *
 * - `"auto"` / `"subprocess"`: shell out to `/usr/bin/security` for
 *   every operation. ~25ms per call, no ACL dialogs, works with
 *   unsigned / ad-hoc signed callers. Safe default.
 * - `"ffi"`: call Security.framework directly via `bun:ffi`. ~1ms
 *   per read, but currently triggers a macOS trust dialog when the
 *   calling binary is not signed with a stable Developer ID.
 *   Experimental — opt-in only. Falls back to subprocess when
 *   `bun:ffi` is unavailable (Node runtime).
 */
export type MacOSBackend = 'auto' | 'subprocess' | 'ffi';

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/**
 * Resolve the appropriate macOS store for the current runtime.
 *
 * Defaults to `"auto"` which picks the subprocess backend — the only
 * path that reliably avoids macOS keychain trust dialogs for ad-hoc
 * signed binaries. Callers can opt into `"ffi"` for the ~25× perf win
 * if and only if the calling binary is signed with a stable Developer
 * ID certificate (dialogs appear otherwise).
 */
export async function createMacOSStore(backend: MacOSBackend = 'auto'): Promise<CredentialStore> {
  if (backend === 'ffi' && isBun) {
    const mod = await import('./macos-security-ffi');
    return new mod.MacOSSecurityFFIStore();
  }
  return new MacOSSecuritySubprocessStore();
}

/**
 * Synchronous variant — returns the subprocess backend unconditionally.
 * Callers that cannot await (e.g. `createDefaultStore()` used by the
 * CLI's synchronous Effect layer construction) can use this at the
 * cost of giving up the FFI opt-in.
 */
export function createMacOSStoreSync(): CredentialStore {
  return new MacOSSecuritySubprocessStore();
}

// Re-export both concrete stores for callers that want to wire a
// specific one by hand (tests, benchmarks, diagnostics).
export { MacOSSecuritySubprocessStore } from './macos-security-subprocess';
