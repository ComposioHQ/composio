/**
 * macOS Keychain store backed by the `/usr/bin/security` CLI.
 *
 * This is a structural port of the `apple-native-keyring-store` crate
 * from keyring-rs. The Rust version calls Security.framework via
 * `security-framework::os::macos::passwords::{find,set}_generic_password`;
 * we shell out to `/usr/bin/security`'s `add-generic-password`,
 * `find-generic-password`, and `delete-generic-password` subcommands
 * because they are 1:1 wrappers over the same Security.framework APIs,
 * ship with every macOS, and give us a trivially auditable execution
 * surface vs. FFI.
 *
 * Exit-code mapping is taken from `decode_error` in
 * `apple-native-keyring-store/src/keychain.rs`:
 *
 *     errSecItemNotFound      (-25300) → NoEntry
 *     errSecNotAvailable      (-25291) → NoStorageAccess
 *     errSecReadOnly          (-25292) → NoStorageAccess
 *     errSecNoSuchKeychain    (-25294) → NoStorageAccess
 *     errSecInvalidKeychain   (-25295) → NoStorageAccess
 *     errSecAuthFailed        (-25293) → NoStorageAccess
 *     everything else                  → PlatformFailure
 *
 * The `security` CLI translates OSStatus values to its own exit codes
 * (typically the low byte of the OSStatus), which is why we see exit
 * 44 for item-not-found instead of -25300.
 */

import type { CredentialStore, EntryModifiers } from '../core/store';
import { CredentialPersistence } from '../core/persistence';
import { KeyringError } from '../core/errors';
import { bytesToUtf8, decodeSecret, encodeSecret, runCommand, type SpawnResult } from './shared';

const SECURITY_BIN = '/usr/bin/security';

/** `security` CLI exit code for `errSecItemNotFound`. */
const EXIT_ITEM_NOT_FOUND = 44;
/** `security` CLI exit code for `errSecDuplicateItem`. */
const EXIT_DUPLICATE_ITEM = 45;
/**
 * Exit codes that translate to `NoStorageAccess`. These correspond to
 * the OSStatus values keyring-rs's `decode_error` maps to the same
 * variant — keychain locked, read-only mount, missing/invalid keychain
 * domain, or auth failure when the user cancels an unlock prompt.
 */
const EXIT_NO_STORAGE_ACCESS = new Set([36, 37, 50, 51, 45401]);

/** Map the `keychain` modifier onto the `-A`/-domain flags of `security`. */
function domainFlag(domain: EntryModifiers['keychain']): readonly string[] {
  // The `security` CLI picks the login keychain by default, which is
  // the `User` domain. The other domains require the -A / --keychain
  // flag with a specific path; surface them as NotSupportedByStore for
  // v0 so we don't silently write to the wrong place.
  if (domain === undefined || domain === 'User') {
    return [];
  }
  throw new KeyringError({
    kind: 'NotSupportedByStore',
    operation: `macos keychain domain "${domain}"`,
  });
}

function validateSpecifier(service: string, user: string): void {
  // Empty service or user would become wildcards in Keychain Services
  // — keyring-rs throws `Error::Invalid` here and we match that.
  if (service.includes('\0')) {
    throw new KeyringError({
      kind: 'Invalid',
      param: 'service',
      reason: 'service must not contain NUL bytes',
    });
  }
  if (user.includes('\0')) {
    throw new KeyringError({
      kind: 'Invalid',
      param: 'user',
      reason: 'user must not contain NUL bytes',
    });
  }
}

function classifyExitCode(result: SpawnResult, operation: string): KeyringError {
  const code = result.code;
  const stderr = bytesToUtf8(result.stderr).trim();
  if (code === EXIT_ITEM_NOT_FOUND) {
    return new KeyringError({ kind: 'NoEntry' });
  }
  if (code !== null && EXIT_NO_STORAGE_ACCESS.has(code)) {
    return new KeyringError({
      kind: 'NoStorageAccess',
      cause: new Error(stderr || `security ${operation} failed with exit ${code}`),
    });
  }
  return new KeyringError({
    kind: 'PlatformFailure',
    cause: new Error(stderr || `security ${operation} failed with exit ${code}`),
  });
}

export class MacOSSecuritySubprocessStore implements CredentialStore {
  readonly id = 'macos-security-subprocess';
  readonly vendor = 'Apple Security.framework (via /usr/bin/security)';

  persistence(): CredentialPersistence {
    return CredentialPersistence.UntilDelete;
  }

  async setSecret(
    service: string,
    user: string,
    secret: Uint8Array,
    modifiers: EntryModifiers
  ): Promise<void> {
    validateSpecifier(service, user);
    const encoded = encodeSecret(secret);
    const label = modifiers.label ?? defaultLabel(service, user);
    const domainArgs = domainFlag(modifiers.keychain);

    // -U: update if it already exists (idempotent set).
    // -l: human-readable label (shown in Keychain Access).
    //
    // Password leak risk: `-w <value>` puts the secret on argv, so it
    // is briefly visible in `ps` output. This matches the behavior of
    // every OTHER tool that shells out to `security` (git credential
    // osxkeychain, 1Password CLI, etc.). Callers that can't tolerate
    // this are expected to fall back to the on-disk `~/.composio/`
    // user config — the CLI already owns that code path.
    const args = [
      'add-generic-password',
      '-U',
      '-a',
      user,
      '-s',
      service,
      '-l',
      label,
      '-w',
      encoded,
      ...domainArgs,
    ];

    let result: SpawnResult;
    try {
      result = await runCommand({ command: SECURITY_BIN, args });
    } catch (err) {
      throw new KeyringError({ kind: 'NoStorageAccess', cause: err });
    }

    if (result.code === 0) return;

    // With -U, duplicates should update in place; if we still see
    // errSecDuplicateItem something unusual happened.
    if (result.code === EXIT_DUPLICATE_ITEM) {
      throw new KeyringError({
        kind: 'PlatformFailure',
        cause: new Error('security add-generic-password: duplicate item despite -U flag'),
      });
    }
    throw classifyExitCode(result, 'add-generic-password');
  }

  async getSecret(service: string, user: string, modifiers: EntryModifiers): Promise<Uint8Array> {
    validateSpecifier(service, user);
    const domainArgs = domainFlag(modifiers.keychain);

    // -w prints the password to stdout and nothing else. Without -w,
    // `security` dumps the item's attributes in a human-readable form
    // that's painful to parse.
    const args = ['find-generic-password', '-a', user, '-s', service, '-w', ...domainArgs];

    let result: SpawnResult;
    try {
      result = await runCommand({ command: SECURITY_BIN, args });
    } catch (err) {
      throw new KeyringError({ kind: 'NoStorageAccess', cause: err });
    }

    if (result.code !== 0) {
      throw classifyExitCode(result, 'find-generic-password');
    }

    // `security -w` prints the value followed by \n. Strip exactly one
    // trailing newline — the base64 alphabet does not contain \n, so
    // any remaining whitespace would be a malformed blob.
    const stdout = bytesToUtf8(result.stdout).replace(/\n$/, '');
    try {
      return decodeSecret(stdout);
    } catch (err) {
      throw new KeyringError({
        kind: 'BadDataFormat',
        bytes: new Uint8Array(result.stdout),
        cause: err,
      });
    }
  }

  async deleteCredential(service: string, user: string, modifiers: EntryModifiers): Promise<void> {
    validateSpecifier(service, user);
    const domainArgs = domainFlag(modifiers.keychain);
    const args = ['delete-generic-password', '-a', user, '-s', service, ...domainArgs];

    let result: SpawnResult;
    try {
      result = await runCommand({ command: SECURITY_BIN, args });
    } catch (err) {
      throw new KeyringError({ kind: 'NoStorageAccess', cause: err });
    }

    if (result.code === 0) return;
    throw classifyExitCode(result, 'delete-generic-password');
  }
}

/** Default label matches the format keyring-rs generates on Linux (`keyring:{user}@{service}`). */
function defaultLabel(service: string, user: string): string {
  return `keyring:${user}@${service}`;
}
