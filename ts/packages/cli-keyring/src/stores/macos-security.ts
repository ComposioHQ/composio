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

/** True when running inside the Bun runtime (production CLI binary, or `bun` CLI). */
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/**
 * Resolve the appropriate macOS store for the current runtime.
 *
 * The FFI module is imported dynamically so Node doesn't choke on its
 * top-level `import 'bun:ffi'` — the failing import would crash Node
 * at module load time even if callers never intend to use it.
 */
export async function createMacOSStore(): Promise<CredentialStore> {
  if (isBun) {
    const mod = await import('./macos-security-ffi');
    return new mod.MacOSSecurityFFIStore();
  }
  return new MacOSSecuritySubprocessStore();
}

/**
 * Synchronous variant — returns the subprocess backend unconditionally.
 * Callers that cannot await (e.g. `createDefaultStore()` used by the
 * CLI's synchronous Effect layer construction) can use this at the
 * cost of giving up the FFI perf win. The CLI itself should prefer the
 * async path.
 */
export function createMacOSStoreSync(): CredentialStore {
  return new MacOSSecuritySubprocessStore();
}

// Re-export both concrete stores for callers that want to wire a
// specific one by hand (tests, benchmarks, diagnostics).
export { MacOSSecuritySubprocessStore } from './macos-security-subprocess';
