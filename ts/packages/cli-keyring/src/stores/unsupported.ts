/**
 * Fallback store used on unsupported platforms (Windows, BSDs, …).
 *
 * Every operation throws `KeyringError({ kind: 'NoStorageAccess' })`
 * so the CLI can fall back to the legacy on-disk config without the
 * platform check leaking into caller code.
 */

import type { CredentialStore } from '../core/store';
import { CredentialPersistence } from '../core/persistence';
import { KeyringError } from '../core/errors';

export class UnsupportedPlatformStore implements CredentialStore {
  readonly id = 'unsupported';
  readonly vendor: string;

  constructor(platform: string) {
    this.vendor = `unsupported platform (${platform})`;
  }

  persistence(): CredentialPersistence {
    return CredentialPersistence.Unspecified;
  }

  async setSecret(): Promise<void> {
    throw this.unavailable();
  }
  async getSecret(): Promise<never> {
    throw this.unavailable();
  }
  async deleteCredential(): Promise<void> {
    throw this.unavailable();
  }

  private unavailable(): KeyringError {
    return new KeyringError({
      kind: 'NoStorageAccess',
      cause: new Error(
        `@composio/cli-keyring does not yet support ${this.vendor}. ` +
          'Only macOS (Keychain via /usr/bin/security) and Linux (Secret Service via secret-tool) are implemented.'
      ),
    });
  }
}
