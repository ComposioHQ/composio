/**
 * `Entry` — the specifier-based credential handle users interact with.
 *
 * Mirrors `keyring_core::api::Entry` / `CredentialApi`. An `Entry` is
 * just a `(service, user, modifiers)` triple that routes calls through
 * the process-global default store. There is no long-lived handle to
 * the underlying credential — every call is a round-trip to the OS.
 */

import { KeyringError } from './errors';
import { type CredentialStore, type EntryModifiers, getDefaultStore } from './store';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Identifies a credential by `service` + `user`, with optional
 * per-store modifiers (keychain domain, Secret Service collection,
 * custom label).
 *
 * Both `service` and `user` must be non-empty — empty strings act as
 * wildcards in Keychain Services and would silently delete other
 * credentials. This mirrors keyring-rs's `Invalid` check on the macOS
 * backend and we enforce it uniformly so behavior doesn't diverge by
 * platform.
 */
export class Entry {
  readonly service: string;
  readonly user: string;
  readonly modifiers: EntryModifiers;

  /**
   * Override the store just for this entry (e.g. tests). When `null`,
   * the process-global default store is resolved on every call so that
   * `setDefaultStore` / `unsetDefaultStore` take effect immediately.
   */
  private readonly overrideStore: CredentialStore | null;

  constructor(
    service: string,
    user: string,
    modifiers: EntryModifiers = {},
    overrideStore: CredentialStore | null = null
  ) {
    if (service.length === 0) {
      throw new KeyringError({
        kind: 'Invalid',
        param: 'service',
        reason: 'service must be a non-empty string',
      });
    }
    if (user.length === 0) {
      throw new KeyringError({
        kind: 'Invalid',
        param: 'user',
        reason: 'user must be a non-empty string',
      });
    }
    this.service = service;
    this.user = user;
    this.modifiers = modifiers;
    this.overrideStore = overrideStore;
  }

  /**
   * Store `password` as UTF-8 bytes under this entry's specifier.
   * Overwrites any existing value.
   */
  async setPassword(password: string): Promise<void> {
    await this.setSecret(textEncoder.encode(password));
  }

  /**
   * Fetch the stored value and decode it as UTF-8. Throws
   * `KeyringError({ kind: 'NoEntry' })` if nothing was stored, or
   * `KeyringError({ kind: 'BadEncoding', bytes })` if the stored bytes
   * aren't valid UTF-8 — matching keyring-rs's `Error::BadEncoding`.
   */
  async getPassword(): Promise<string> {
    const bytes = await this.getSecret();
    try {
      return textDecoder.decode(bytes);
    } catch {
      throw new KeyringError({ kind: 'BadEncoding', bytes });
    }
  }

  /** Store raw bytes. */
  async setSecret(secret: Uint8Array): Promise<void> {
    await this.resolveStore().setSecret(this.service, this.user, secret, this.modifiers);
  }

  /** Fetch raw bytes. Throws `NoEntry` if nothing matches. */
  async getSecret(): Promise<Uint8Array> {
    return this.resolveStore().getSecret(this.service, this.user, this.modifiers);
  }

  /** Delete the credential. Throws `NoEntry` if it didn't exist. */
  async deleteCredential(): Promise<void> {
    await this.resolveStore().deleteCredential(this.service, this.user, this.modifiers);
  }

  private resolveStore(): CredentialStore {
    return this.overrideStore ?? getDefaultStore();
  }
}
