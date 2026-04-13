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
 * Resolve the appropriate macOS store for the current runtime.
 *
 * Always returns the subprocess store today. The FFI backend is
 * architecturally ready (see `macos-security-ffi.ts`) but is
 * intentionally NOT selected here: direct `SecItemCopyMatching` calls
 * from an **ad-hoc signed** composio binary trigger a macOS keychain
 * trust dialog on read, even when the item's ACL is allow-any via
 * `security -A`. Apple's own `/usr/bin/security` binary is Developer
 * ID-signed by Apple and is exempt from this additional check, so
 * shelling out reads and writes through it works consistently. The
 * FFI path becomes viable the day the composio CLI ships with a
 * stable Developer ID signature — one-line flip then.
 *
 * Signature kept async to preserve the API contract for when the FFI
 * path is re-enabled (it needs dynamic `import('./macos-security-ffi')`
 * to avoid a top-level `import 'bun:ffi'` that would crash Node).
 */
export async function createMacOSStore(): Promise<CredentialStore> {
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
