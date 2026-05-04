/**
 * `@composio/cli-keyring` — cross-platform OS credential storage for
 * the Composio CLI. Structurally modeled after
 * [keyring-rs](https://github.com/open-source-cooperative/keyring-rs)
 * but implemented as a thin shell over OS primitives so we own every
 * byte of the execution surface and never depend on a third-party
 * native module.
 *
 * Backends:
 *   - **macOS (Bun runtime)**: direct Security.framework calls via
 *     `bun:ffi`. ~1ms reads, no subprocess overhead, ACL = allow-any
 *     (upgrade-stable; identical threat model to the subprocess
 *     backend until the CLI is Developer ID-signed).
 *   - **macOS (Node runtime / fallback)**: `/usr/bin/security`
 *     subprocess. Same semantics, ~25ms reads.
 *   - **Linux**: `secret-tool` subprocess against the freedesktop
 *     Secret Service API, with keyring-rs-compatible attribute names.
 *
 * Typical usage:
 *
 * ```ts
 * import { Entry, setDefaultStore, createDefaultStore } from '@composio/cli-keyring';
 *
 * setDefaultStore(await createDefaultStore());
 *
 * const entry = new Entry('com.composio.cli', 'default');
 * await entry.setPassword(apiKey);
 * const stored = await entry.getPassword();
 * await entry.deleteCredential();
 * ```
 */

export { Entry } from './core/entry';
export { KeyringError, type KeyringErrorDetails, type KeyringErrorKind } from './core/errors';
export { CredentialPersistence } from './core/persistence';
export {
  type CredentialStore,
  type EntryModifiers,
  setDefaultStore,
  unsetDefaultStore,
  getDefaultStore,
  hasDefaultStore,
} from './core/store';

import type { CredentialStore } from './core/store';
import { createMacOSStore, createMacOSStoreSync, type MacOSBackend } from './stores/macos-security';
import { LinuxSecretToolStore } from './stores/linux-secret-tool';
import { UnsupportedPlatformStore } from './stores/unsupported';

/**
 * Instantiate the native store for the current platform (async). On
 * macOS under Bun this resolves to the fast FFI backend; under Node
 * (typically tests or tools that import this package without Bun) it
 * falls back to the `/usr/bin/security` subprocess backend. On Linux
 * it always returns the `secret-tool` subprocess backend. Unsupported
 * platforms return a store whose operations throw `NoStorageAccess`.
 *
 * Call this once at process startup, pass the result to
 * `setDefaultStore`, and use `new Entry(service, user)` everywhere.
 */
export async function createDefaultStore(
  options: { macOSBackend?: MacOSBackend } = {}
): Promise<CredentialStore> {
  switch (process.platform) {
    case 'darwin':
      return await createMacOSStore(options.macOSBackend ?? 'auto');
    case 'linux':
      return new LinuxSecretToolStore();
    default:
      return new UnsupportedPlatformStore(process.platform);
  }
}

/**
 * Synchronous fallback that never returns the FFI macOS backend —
 * useful for callers that can't await at construction time (e.g. the
 * Effect.ts `Layer.sync` variant) and are willing to accept the
 * subprocess overhead. The async `createDefaultStore()` is strongly
 * preferred in the CLI's hot path.
 */
export function createDefaultStoreSync(): CredentialStore {
  switch (process.platform) {
    case 'darwin':
      return createMacOSStoreSync();
    case 'linux':
      return new LinuxSecretToolStore();
    default:
      return new UnsupportedPlatformStore(process.platform);
  }
}

export { createMacOSStore, createMacOSStoreSync, type MacOSBackend } from './stores/macos-security';
export { MacOSSecuritySubprocessStore } from './stores/macos-security-subprocess';
export { LinuxSecretToolStore } from './stores/linux-secret-tool';
export { UnsupportedPlatformStore } from './stores/unsupported';
