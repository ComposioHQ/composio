/**
 * Windows Credential Manager store backed by `advapi32.dll` via `bun:ffi`.
 *
 * Each credential is a generic credential (`CRED_TYPE_GENERIC`) whose target
 * name is `{user}.{service}`, the convention keyring-rs uses on Windows. The
 * secret is stored as the raw credential blob, which Windows encrypts with
 * the signed-in user's key; other users of the machine cannot read it.
 *
 * There is no subprocess fallback: Windows ships no tool that reads a generic
 * credential back. This module must not be imported from Node, because it
 * depends on `bun:ffi`; `createDefaultStore` loads it only under Bun.
 */

import { dlopen, FFIType, ptr, toArrayBuffer } from 'bun:ffi';
import type { CredentialStore, EntryModifiers } from '../core/store';
import { CredentialPersistence } from '../core/persistence';
import { KeyringError } from '../core/errors';

const CRED_TYPE_GENERIC = 1;
/** Kept across sign-ins on this machine, and not roamed to other machines. */
const CRED_PERSIST_LOCAL_MACHINE = 2;
/** `CRED_MAX_CREDENTIAL_BLOB_SIZE` from wincred.h. */
const MAX_SECRET_BYTES = 5 * 512;
const ERROR_NOT_FOUND = 1168;

/**
 * Field offsets of `CREDENTIALW` on 64-bit Windows:
 *
 *    0  DWORD    Flags
 *    4  DWORD    Type
 *    8  LPWSTR   TargetName
 *   16  LPWSTR   Comment
 *   24  FILETIME LastWritten
 *   32  DWORD    CredentialBlobSize
 *   40  LPBYTE   CredentialBlob
 *   48  DWORD    Persist
 *   52  DWORD    AttributeCount
 *   56  PCREDENTIAL_ATTRIBUTEW Attributes
 *   64  LPWSTR   TargetAlias
 *   72  LPWSTR   UserName
 */
const CREDENTIAL_SIZE = 80;
const OFFSET_TYPE = 4;
const OFFSET_TARGET_NAME = 8;
const OFFSET_BLOB_SIZE = 32;
const OFFSET_BLOB = 40;
const OFFSET_PERSIST = 48;
const OFFSET_USER_NAME = 72;

const advapi32 = dlopen('advapi32.dll', {
  CredWriteW: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  CredReadW: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.i32,
  },
  CredDeleteW: { args: [FFIType.ptr, FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  CredFree: { args: [FFIType.u64], returns: FFIType.void },
});

const kernel32 = dlopen('kernel32.dll', {
  GetLastError: { args: [], returns: FFIType.u32 },
});

/** Encode a JS string as a NUL-terminated UTF-16 buffer (`LPCWSTR`). */
function wstr(value: string): Uint16Array {
  const buffer = new Uint16Array(value.length + 1);
  for (let i = 0; i < value.length; i++) buffer[i] = value.charCodeAt(i);
  return buffer;
}

function targetName(service: string, user: string): string {
  return `${user}.${service}`;
}

function validateSpecifier(service: string, user: string): void {
  for (const [param, value] of [
    ['service', service],
    ['user', user],
  ] as const) {
    if (value.length === 0) {
      throw new KeyringError({
        kind: 'Invalid',
        param,
        reason: `${param} must be a non-empty string`,
      });
    }
    if (value.includes('\0')) {
      throw new KeyringError({ kind: 'Invalid', param, reason: 'must not contain NUL bytes' });
    }
  }
}

/**
 * Map a failed `Cred*` call to a `KeyringError`. A lookup that fails without
 * an error code is treated as a missing entry: the runtime can reset the
 * thread's last-error value between the failing call and `GetLastError`.
 */
function lookupError(operation: string): KeyringError {
  const code = kernel32.symbols.GetLastError();
  if (code === ERROR_NOT_FOUND || code === 0) {
    return new KeyringError({ kind: 'NoEntry' });
  }
  return platformFailure(operation, code);
}

function platformFailure(operation: string, code: number): KeyringError {
  return new KeyringError({
    kind: 'PlatformFailure',
    cause: new Error(`${operation} failed with Windows error ${code}`),
  });
}

export class WindowsCredentialFFIStore implements CredentialStore {
  readonly id = 'windows-credential-ffi';
  readonly vendor = 'Windows Credential Manager (via bun:ffi Cred*)';

  persistence(): CredentialPersistence {
    return CredentialPersistence.UntilDelete;
  }

  async setSecret(
    service: string,
    user: string,
    secret: Uint8Array,
    _modifiers: EntryModifiers
  ): Promise<void> {
    validateSpecifier(service, user);
    if (secret.byteLength > MAX_SECRET_BYTES) {
      throw new KeyringError({ kind: 'TooLong', attr: 'secret', limit: MAX_SECRET_BYTES });
    }

    // These buffers are referenced by address from the struct, so they must
    // stay alive until CredWriteW returns.
    const target = wstr(targetName(service, user));
    const userName = wstr(user);
    const blob = Uint8Array.from(secret);

    const credential = new Uint8Array(CREDENTIAL_SIZE);
    const view = new DataView(credential.buffer);
    view.setUint32(OFFSET_TYPE, CRED_TYPE_GENERIC, true);
    view.setBigUint64(OFFSET_TARGET_NAME, BigInt(ptr(target)), true);
    view.setUint32(OFFSET_BLOB_SIZE, blob.byteLength, true);
    view.setBigUint64(OFFSET_BLOB, blob.byteLength === 0 ? 0n : BigInt(ptr(blob)), true);
    view.setUint32(OFFSET_PERSIST, CRED_PERSIST_LOCAL_MACHINE, true);
    view.setBigUint64(OFFSET_USER_NAME, BigInt(ptr(userName)), true);

    // CredWriteW replaces an existing credential with the same target name.
    const written = advapi32.symbols.CredWriteW(credential, 0);
    if (written === 0) {
      throw platformFailure('CredWriteW', kernel32.symbols.GetLastError());
    }
  }

  async getSecret(service: string, user: string, _modifiers: EntryModifiers): Promise<Uint8Array> {
    validateSpecifier(service, user);

    // CredReadW writes a PCREDENTIALW into this 8-byte slot.
    const credentialOut = new BigUint64Array(1);
    const found = advapi32.symbols.CredReadW(
      wstr(targetName(service, user)),
      CRED_TYPE_GENERIC,
      0,
      credentialOut
    );
    if (found === 0) {
      throw lookupError('CredReadW');
    }

    const credential = credentialOut[0] ?? 0n;
    try {
      const view = new DataView(toArrayBuffer(Number(credential) as never, 0, CREDENTIAL_SIZE));
      const size = view.getUint32(OFFSET_BLOB_SIZE, true);
      const blob = view.getBigUint64(OFFSET_BLOB, true);
      if (size === 0 || blob === 0n) return new Uint8Array(0);
      // Copy: the memory belongs to Windows and is released by CredFree below.
      return new Uint8Array(toArrayBuffer(Number(blob) as never, 0, size)).slice();
    } finally {
      advapi32.symbols.CredFree(credential);
    }
  }

  async deleteCredential(service: string, user: string, _modifiers: EntryModifiers): Promise<void> {
    validateSpecifier(service, user);
    const deleted = advapi32.symbols.CredDeleteW(
      wstr(targetName(service, user)),
      CRED_TYPE_GENERIC,
      0
    );
    if (deleted === 0) {
      throw lookupError('CredDeleteW');
    }
  }
}
