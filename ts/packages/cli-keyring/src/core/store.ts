/**
 * Store contract and process-global registry.
 *
 * Mirrors `keyring_core::api::CredentialStoreApi` + the
 * `set_default_store` / `get_default_store` / `unset_default_store`
 * helpers from `keyring_core::lib`. Tests can swap the default store
 * with an in-memory mock via `setDefaultStore`.
 */

import type { CredentialPersistence } from './persistence';
import { KeyringError } from './errors';

/**
 * Optional per-entry modifiers supported by this package. Not every
 * store honors every modifier:
 *
 * - `label`   — human-readable label shown in Keychain Access / seahorse.
 *               If omitted, stores default to `keyring:{user}@{service}`
 *               to match the label format keyring-rs produces.
 * - `collection` — Secret Service collection name (Linux only).
 *                  Defaults to `"default"`, matching keyring-rs's `target`
 *                  attribute convention.
 * - `keychain` — macOS keychain domain (`User` | `System` | `Common` |
 *                `Dynamic`). Defaults to `User` (the login keychain).
 */
export interface EntryModifiers {
  readonly label?: string;
  readonly collection?: string;
  readonly keychain?: 'User' | 'System' | 'Common' | 'Dynamic';
}

/**
 * The low-level operations a backend must implement. `Entry` is a thin
 * specifier wrapper that routes every call through the active store.
 *
 * All operations are async because both supported backends are
 * subprocess-based (`/usr/bin/security`, `secret-tool`). Throwing
 * `KeyringError` with a precise `kind` is required — callers need to
 * distinguish `NoEntry` from `NoStorageAccess` at minimum.
 */
export interface CredentialStore {
  /** Short identifier shown in error messages and logs. */
  readonly id: string;
  /** Vendor / platform description. */
  readonly vendor: string;

  /** Lifetime characteristics of credentials stored by this backend. */
  persistence(): CredentialPersistence;

  /**
   * Store `secret` under `(service, user)`. Overwrites any existing
   * value for the same specifier.
   */
  setSecret(
    service: string,
    user: string,
    secret: Uint8Array,
    modifiers: EntryModifiers
  ): Promise<void>;

  /**
   * Fetch the raw bytes previously stored via `setSecret`. Must throw
   * `KeyringError({ kind: 'NoEntry' })` if nothing matches.
   */
  getSecret(service: string, user: string, modifiers: EntryModifiers): Promise<Uint8Array>;

  /**
   * Remove the credential identified by `(service, user)`. Throws
   * `NoEntry` if it didn't exist.
   */
  deleteCredential(service: string, user: string, modifiers: EntryModifiers): Promise<void>;
}

// -----------------------------------------------------------------------------
// Process-global default store registry
// -----------------------------------------------------------------------------

let defaultStore: CredentialStore | null = null;

/**
 * Register the store that `new Entry(service, user)` should dispatch to.
 * The CLI calls this once at startup; tests call it to inject a mock.
 */
export function setDefaultStore(store: CredentialStore): void {
  defaultStore = store;
}

/** Clear the registered store — mostly useful for test teardown. */
export function unsetDefaultStore(): void {
  defaultStore = null;
}

/**
 * Return the active default store or throw `NoDefaultStore` if none is
 * registered. Callers that want a non-throwing check should use
 * `hasDefaultStore()` instead.
 */
export function getDefaultStore(): CredentialStore {
  if (defaultStore === null) {
    throw new KeyringError({ kind: 'NoDefaultStore' });
  }
  return defaultStore;
}

export function hasDefaultStore(): boolean {
  return defaultStore !== null;
}
