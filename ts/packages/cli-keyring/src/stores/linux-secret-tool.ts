/**
 * Linux Secret Service store backed by the `secret-tool` CLI.
 *
 * This is a structural port of the `dbus-secret-service-keyring-store`
 * crate from keyring-rs. The Rust version speaks the
 * `org.freedesktop.Secret.Service` D-Bus protocol directly via the
 * `dbus-secret-service` crate; we invoke `secret-tool`, a one-line
 * wrapper shipped in the `libsecret-tools` (Debian/Ubuntu) or
 * `libsecret` (Fedora/Arch) package that exposes the exact same
 * Secret Service operations. Using the CLI keeps the execution surface
 * auditable and lets us stay off FFI entirely.
 *
 * Attribute naming follows keyring-rs for interop with any other
 * keyring-rs-based tool the user might run on the same system:
 *
 *     service   → the application / service name
 *     username  → the user / account
 *     target    → the Secret Service collection (default: "default")
 *
 * Labels default to `keyring:{user}@{service}`, matching
 * `dbus-secret-service-keyring-store`'s default label format.
 */

import { existsSync } from 'node:fs';
import type { CredentialStore, EntryModifiers } from '../core/store';
import { CredentialPersistence } from '../core/persistence';
import { KeyringError } from '../core/errors';
import {
  bytesToUtf8,
  decodeSecret,
  encodeSecret,
  runCommand,
  utf8ToBytes,
  type SpawnResult,
} from './shared';

const SECRET_TOOL_BIN = 'secret-tool';

function validateSpecifier(service: string, user: string): void {
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

function attributeArgs(
  service: string,
  user: string,
  modifiers: EntryModifiers
): readonly string[] {
  // Match keyring-rs's attribute keys exactly so credentials stored by
  // this package are readable by any Rust tool using keyring-rs (and
  // vice-versa) on the same session.
  return ['service', service, 'username', user, 'target', modifiers.collection ?? 'default'];
}

/**
 * Classify a spawn error into a KeyringError. We can't rely on `code`
 * alone because `secret-tool` returns `1` for almost every failure;
 * stderr text is the main signal.
 */
function classifyFailure(result: SpawnResult, operation: string): KeyringError {
  const stderr = bytesToUtf8(result.stderr).trim();

  // D-Bus errors that mean "the session bus or the secret daemon is
  // unreachable" — headless systems, containers, or SSH without a
  // running keyring. Treat as NoStorageAccess so callers can fall back
  // to on-disk config.
  if (
    stderr.includes('org.freedesktop.DBus.Error.ServiceUnknown') ||
    stderr.includes('org.freedesktop.DBus.Error.NoReply') ||
    stderr.includes('Cannot autolaunch D-Bus without X11') ||
    stderr.includes('Cannot spawn a message bus') ||
    stderr.includes('No such interface') ||
    stderr.includes('secret_service_get_sync')
  ) {
    return new KeyringError({
      kind: 'NoStorageAccess',
      cause: new Error(stderr || `${operation} failed: D-Bus Secret Service unreachable`),
    });
  }

  // "The collection does not exist" / "Prompt was dismissed" usually
  // means the user cancelled an unlock prompt.
  if (stderr.includes('dismissed') || stderr.includes('does not exist')) {
    return new KeyringError({
      kind: 'NoStorageAccess',
      cause: new Error(stderr),
    });
  }

  return new KeyringError({
    kind: 'PlatformFailure',
    cause: new Error(stderr || `${operation} failed with exit ${result.code}`),
  });
}

function missingDBus(): boolean {
  // `secret-tool` requires a session bus. When SSHing without bus
  // forwarding, neither var is set. We fail fast with a clear message
  // instead of letting the user wait for `dbus-daemon --session` to
  // time out.
  return (
    process.env.DBUS_SESSION_BUS_ADDRESS === undefined &&
    !existsSync(`/run/user/${process.getuid?.() ?? -1}/bus`)
  );
}

export class LinuxSecretToolStore implements CredentialStore {
  readonly id = 'linux-secret-tool';
  readonly vendor = 'freedesktop.org Secret Service (via secret-tool)';

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
    if (missingDBus()) {
      throw new KeyringError({
        kind: 'NoStorageAccess',
        cause: new Error(
          'D-Bus session bus not available — no DBUS_SESSION_BUS_ADDRESS and no /run/user/<uid>/bus'
        ),
      });
    }

    const encoded = encodeSecret(secret);
    const label = modifiers.label ?? defaultLabel(service, user);
    const args = ['store', '--label', label, ...attributeArgs(service, user, modifiers)];

    // `secret-tool store` reads the password from stdin (one line,
    // terminated by LF). encodeSecret returns ASCII base64 with our
    // `b64:` prefix, so it's always a single printable line.
    let result: SpawnResult;
    try {
      result = await runCommand({
        command: SECRET_TOOL_BIN,
        args,
        stdin: utf8ToBytes(encoded + '\n'),
      });
    } catch (err) {
      throw this.spawnErrorToKeyringError(err);
    }

    if (result.code === 0) return;
    throw classifyFailure(result, 'secret-tool store');
  }

  async getSecret(service: string, user: string, modifiers: EntryModifiers): Promise<Uint8Array> {
    validateSpecifier(service, user);
    if (missingDBus()) {
      throw new KeyringError({
        kind: 'NoStorageAccess',
        cause: new Error(
          'D-Bus session bus not available — no DBUS_SESSION_BUS_ADDRESS and no /run/user/<uid>/bus'
        ),
      });
    }

    const args = ['lookup', ...attributeArgs(service, user, modifiers)];

    let result: SpawnResult;
    try {
      result = await runCommand({ command: SECRET_TOOL_BIN, args });
    } catch (err) {
      throw this.spawnErrorToKeyringError(err);
    }

    if (result.code === 0) {
      const stdout = bytesToUtf8(result.stdout);
      // `secret-tool lookup` prints the password without a trailing
      // newline when found, and prints nothing (exit 0) when not found.
      if (stdout.length === 0) {
        throw new KeyringError({ kind: 'NoEntry' });
      }
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

    // Exit 1 can mean many things — stderr is the real signal.
    throw classifyFailure(result, 'secret-tool lookup');
  }

  async deleteCredential(service: string, user: string, modifiers: EntryModifiers): Promise<void> {
    validateSpecifier(service, user);
    if (missingDBus()) {
      throw new KeyringError({
        kind: 'NoStorageAccess',
        cause: new Error(
          'D-Bus session bus not available — no DBUS_SESSION_BUS_ADDRESS and no /run/user/<uid>/bus'
        ),
      });
    }

    // `secret-tool clear` returns exit 0 regardless of whether any
    // entry matched, so we probe with `lookup` first to preserve the
    // NoEntry semantics the rest of the package relies on.
    await this.getSecret(service, user, modifiers); // throws NoEntry if missing

    const args = ['clear', ...attributeArgs(service, user, modifiers)];
    let result: SpawnResult;
    try {
      result = await runCommand({ command: SECRET_TOOL_BIN, args });
    } catch (err) {
      throw this.spawnErrorToKeyringError(err);
    }
    if (result.code === 0) return;
    throw classifyFailure(result, 'secret-tool clear');
  }

  private spawnErrorToKeyringError(err: unknown): KeyringError {
    // ENOENT from child_process means `secret-tool` isn't on PATH.
    // Surface a helpful install hint rather than the raw errno.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'
    ) {
      return new KeyringError({
        kind: 'NoStorageAccess',
        cause: new Error(
          'secret-tool not found. Install it with: ' +
            'apt install libsecret-tools  (Debian/Ubuntu) / ' +
            'dnf install libsecret        (Fedora) / ' +
            'pacman -S libsecret          (Arch)'
        ),
      });
    }
    return new KeyringError({ kind: 'NoStorageAccess', cause: err });
  }
}

function defaultLabel(service: string, user: string): string {
  return `keyring:${user}@${service}`;
}
