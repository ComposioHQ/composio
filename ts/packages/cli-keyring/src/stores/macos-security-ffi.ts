/**
 * macOS Keychain store backed by direct Security.framework calls via
 * `bun:ffi`. Structurally this is a TypeScript port of the relevant
 * subset of keyring-rs's `apple-native-keyring-store` crate — which
 * itself delegates to the `security-framework` Rust crate — but we
 * skip the Rust layer and call the C ABI directly from Bun.
 *
 * Why FFI instead of the subprocess `/usr/bin/security` CLI?
 *
 * - **Performance.** A subprocess fork/exec round-trip is ~25ms
 *   median and ~150ms p99 on a warm Mac. A direct `SecItemCopyMatching`
 *   call is sub-millisecond. For hot-path commands (`composio execute`,
 *   `composio run`) this is a 25× improvement per invocation with
 *   effectively zero tail.
 * - **Upgrade-stable ACL.** The item's access control is built with
 *   `SecAccessCreate` + the "allow-any" pattern (empty trusted apps
 *   list, no-prompt selector — mirrors what `security -A` produces),
 *   so the ACL does not depend on the composio binary's code
 *   signature. `composio upgrade` never triggers a keychain dialog.
 *
 * The allow-any ACL matches the threat model of the subprocess
 * implementation exactly: silent exfil via a plaintext file becomes
 * visible exfil via the Bash tool prompt ("claude wants to run
 * /usr/bin/security find-generic-password …"), but the OS does not
 * gate reads to our binary specifically. Upgrading this to a
 * per-binary ACL requires the `composio` binary to be signed with a
 * stable Developer ID certificate so the ACL's designated
 * requirement can survive self-update — that is a separate
 * operational PR, not handled here. When it lands, the
 * `buildAllowAnyAccess` call in `setSecret` is replaced with a
 * single call to a new `buildComposioOnlyAccess` builder that
 * constructs a `SecAccessRef` with the composio binary in the
 * trusted list. The rest of the module is unchanged.
 *
 * Pointer representation: every CoreFoundation / Security
 * reference is carried as `bigint`, never `number`. Reason: short
 * `CFString` values and other small CF types are represented as
 * **tagged pointers** in CoreFoundation — the string data is packed
 * directly into pointer bits with the high bits set as tag
 * markers, producing addresses above 2^53. JavaScript's `number`
 * type loses precision above that threshold, so a tagged pointer
 * received as `number` cannot be passed back to another FFI call
 * intact. Declaring every pointer arg/return as `FFIType.u64`
 * preserves full 64-bit fidelity via `BigInt`.
 *
 * This module must not be imported from Node — it depends on
 * `bun:ffi`. The platform picker in `macos-security.ts` is
 * responsible for loading this file only when `typeof Bun !==
 * 'undefined'`.
 */

import { dlopen, FFIType, ptr, toArrayBuffer } from 'bun:ffi';
import type { CredentialStore, EntryModifiers } from '../core/store';
import { CredentialPersistence } from '../core/persistence';
import { KeyringError } from '../core/errors';
import { bytesToUtf8, decodeSecret, encodeSecret, runCommand } from './shared';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');
const SECURITY_BIN = '/usr/bin/security';

/** Encode a JS string as a NUL-terminated UTF-8 byte array (for dlopen/dlsym). */
function cstr(s: string): Uint8Array {
  return textEncoder.encode(s + '\0');
}

// -----------------------------------------------------------------------------
// Low-level dlopen / dlsym (used to resolve `kSec*` / `kCF*` extern const
// data symbols that `bun:ffi`'s normal dlopen surface doesn't expose).
// -----------------------------------------------------------------------------

const LIBSYSTEM = '/usr/lib/libSystem.B.dylib';
const SECURITY_FRAMEWORK = '/System/Library/Frameworks/Security.framework/Security';
const CORE_FOUNDATION = '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation';

const RTLD_NOW = 0x2;

const libSystem = dlopen(LIBSYSTEM, {
  dlopen: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.u64 },
  dlsym: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.u64 },
});

function dlopenRaw(path: string): bigint {
  const handle = libSystem.symbols.dlopen(cstr(path), RTLD_NOW);
  if (handle === 0n) {
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error(`dlopen(${path}) failed`),
    });
  }
  return handle;
}

/**
 * Resolve an extern const CFTypeRef data symbol: `dlsym` returns the
 * address of the storage slot (i.e. a pointer-to-pointer); we
 * dereference one level via `read.ptr` to get the actual CFTypeRef
 * value stored there. The symbol is stable for the process lifetime,
 * so caching the resolved BigInt is safe.
 */
function dlsymCFConstant(handle: bigint, name: string): bigint {
  const addr = libSystem.symbols.dlsym(handle, cstr(name));
  if (addr === 0n) {
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error(`dlsym(${name}) failed`),
    });
  }
  // read.ptr wants a number address — the storage address from dlsym
  // is a real heap address (never tagged), so it fits in a number.
  // The VALUE we read back, however, may be a tagged pointer, so we
  // must capture it as BigInt. `read.ptr` on bun returns number;
  // instead we use a small helper that reads 8 bytes into a BigInt.
  return read64(Number(addr));
}

/**
 * Read a 64-bit little-endian value from a process address and
 * return it as BigInt. Used to dereference data-symbol slots (which
 * live at plain heap addresses) without precision loss on the
 * stored value.
 */
function read64(address: number): bigint {
  // `toArrayBuffer(ptr, offset, length)` wraps a raw pointer as an
  // ArrayBuffer view without copying. We use it for read-only access
  // to an 8-byte window, then pull the BigInt out via DataView.
  const ab = toArrayBuffer(address as unknown as never, 0, 8);
  return new DataView(ab).getBigUint64(0, true);
}

const securityHandle = dlopenRaw(SECURITY_FRAMEWORK);
const coreFoundationHandle = dlopenRaw(CORE_FOUNDATION);

// -----------------------------------------------------------------------------
// Function bindings (CoreFoundation + Security.framework)
// -----------------------------------------------------------------------------

const cf = dlopen(CORE_FOUNDATION, {
  CFStringCreateWithBytes: {
    // allocator, bytes, length, encoding, isExternalRepresentation
    args: [FFIType.u64, FFIType.ptr, FFIType.i64, FFIType.u32, FFIType.bool],
    returns: FFIType.u64,
  },
  CFStringGetCString: {
    args: [FFIType.u64, FFIType.ptr, FFIType.i64, FFIType.u32],
    returns: FFIType.bool,
  },
  CFDataCreate: {
    args: [FFIType.u64, FFIType.ptr, FFIType.i64],
    returns: FFIType.u64,
  },
  CFDataGetBytePtr: {
    args: [FFIType.u64],
    returns: FFIType.u64,
  },
  CFDataGetLength: {
    args: [FFIType.u64],
    returns: FFIType.i64,
  },
  CFDictionaryCreateMutable: {
    args: [FFIType.u64, FFIType.i64, FFIType.u64, FFIType.u64],
    returns: FFIType.u64,
  },
  CFDictionaryAddValue: {
    args: [FFIType.u64, FFIType.u64, FFIType.u64],
    returns: FFIType.void,
  },
  CFArrayGetCount: {
    args: [FFIType.u64],
    returns: FFIType.i64,
  },
  CFArrayGetValueAtIndex: {
    args: [FFIType.u64, FFIType.i64],
    returns: FFIType.u64,
  },
  CFRelease: {
    args: [FFIType.u64],
    returns: FFIType.void,
  },
  CFGetTypeID: {
    args: [FFIType.u64],
    returns: FFIType.u64,
  },
});

const sec = dlopen(SECURITY_FRAMEWORK, {
  SecItemAdd: {
    args: [FFIType.u64, FFIType.u64],
    returns: FFIType.i32,
  },
  SecItemCopyMatching: {
    args: [FFIType.u64, FFIType.u64],
    returns: FFIType.i32,
  },
  SecItemUpdate: {
    args: [FFIType.u64, FFIType.u64],
    returns: FFIType.i32,
  },
  SecItemDelete: {
    args: [FFIType.u64],
    returns: FFIType.i32,
  },
  SecCopyErrorMessageString: {
    args: [FFIType.i32, FFIType.u64],
    returns: FFIType.u64,
  },
});

// -----------------------------------------------------------------------------
// Constant resolution
// -----------------------------------------------------------------------------

/** Resolved extern CFTypeRef constants (stable for process lifetime). */
const K = {
  kSecClass: dlsymCFConstant(securityHandle, 'kSecClass'),
  kSecClassGenericPassword: dlsymCFConstant(securityHandle, 'kSecClassGenericPassword'),
  kSecAttrService: dlsymCFConstant(securityHandle, 'kSecAttrService'),
  kSecAttrAccount: dlsymCFConstant(securityHandle, 'kSecAttrAccount'),
  kSecValueData: dlsymCFConstant(securityHandle, 'kSecValueData'),
  kSecReturnData: dlsymCFConstant(securityHandle, 'kSecReturnData'),
  kSecMatchLimit: dlsymCFConstant(securityHandle, 'kSecMatchLimit'),
  kSecMatchLimitOne: dlsymCFConstant(securityHandle, 'kSecMatchLimitOne'),
  kCFBooleanTrue: dlsymCFConstant(coreFoundationHandle, 'kCFBooleanTrue'),
  kCFTypeDictionaryKeyCallBacks: BigInt(
    addressOfSymbol(coreFoundationHandle, 'kCFTypeDictionaryKeyCallBacks')
  ),
  kCFTypeDictionaryValueCallBacks: BigInt(
    addressOfSymbol(coreFoundationHandle, 'kCFTypeDictionaryValueCallBacks')
  ),
} as const;

/**
 * Return the *address* of a named data symbol (not its dereferenced
 * value). Used for the `kCFType*CallBacks` structs, which are
 * structs in static data rather than pointers — the function wants a
 * pointer TO the struct, not a pointer read out of the symbol slot.
 */
function addressOfSymbol(handle: bigint, name: string): bigint {
  const addr = libSystem.symbols.dlsym(handle, cstr(name));
  if (addr === 0n) {
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error(`dlsym(${name}) failed`),
    });
  }
  return addr;
}

/** UTF-8 encoding constant for CFString. */
const kCFStringEncodingUTF8 = 0x08000100;

// -----------------------------------------------------------------------------
// OSStatus mapping
// -----------------------------------------------------------------------------

const errSecSuccess = 0;
const errSecItemNotFound = -25300;
const errSecAuthFailed = -25293;
const errSecNotAvailable = -25291;
const errSecReadOnly = -25292;
const errSecNoSuchKeychain = -25294;
const errSecInvalidKeychain = -25295;
const errSecWrPerm = -61;

const NO_STORAGE_ACCESS_STATUSES = new Set([
  errSecNotAvailable,
  errSecReadOnly,
  errSecNoSuchKeychain,
  errSecInvalidKeychain,
  errSecAuthFailed,
  errSecWrPerm,
]);

/**
 * Convert an OSStatus into a KeyringError. Uses
 * `SecCopyErrorMessageString` to pull the human-readable description
 * out of the Security framework.
 */
function osStatusToError(status: number, operation: string): KeyringError {
  if (status === errSecItemNotFound) {
    return new KeyringError({ kind: 'NoEntry' });
  }
  const message = osStatusMessage(status) ?? `${operation} failed with OSStatus ${status}`;
  if (NO_STORAGE_ACCESS_STATUSES.has(status)) {
    return new KeyringError({
      kind: 'NoStorageAccess',
      cause: new Error(message),
    });
  }
  return new KeyringError({
    kind: 'PlatformFailure',
    cause: new Error(`${operation}: ${message}`),
  });
}

function osStatusMessage(status: number): string | null {
  const cfString = sec.symbols.SecCopyErrorMessageString(status, 0n);
  if (cfString === 0n) return null;
  try {
    return cfStringToJs(cfString);
  } finally {
    cf.symbols.CFRelease(cfString);
  }
}

// -----------------------------------------------------------------------------
// CoreFoundation helpers
// -----------------------------------------------------------------------------

/**
 * A "retain pool" that releases every CF object pushed into it when
 * `release()` runs. Used to guarantee cleanup across the (potentially
 * many) CF allocations each store operation performs.
 */
class CFPool {
  private readonly refs: bigint[] = [];

  /** Push a CFTypeRef into the pool and return it unchanged for chaining. */
  retain(ref: bigint): bigint {
    if (ref !== 0n) this.refs.push(ref);
    return ref;
  }

  release(): void {
    // Release in reverse order of allocation to match object graph.
    for (let i = this.refs.length - 1; i >= 0; i--) {
      cf.symbols.CFRelease(this.refs[i]!);
    }
    this.refs.length = 0;
  }
}

/** Create a CFString from a JS string (UTF-8 bytes). Throws on allocation failure. */
function cfStringFromJs(pool: CFPool, s: string): bigint {
  const bytes = textEncoder.encode(s);
  const ref = cf.symbols.CFStringCreateWithBytes(
    0n, // kCFAllocatorDefault
    bytes,
    BigInt(bytes.byteLength),
    kCFStringEncodingUTF8,
    false
  );
  if (ref === 0n) {
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error('CFStringCreateWithBytes returned NULL'),
    });
  }
  return pool.retain(ref);
}

/** Read a CFString into a JS UTF-8 string. Only used for error messages. */
function cfStringToJs(cfString: bigint): string {
  const buf = new Uint8Array(4096);
  const ok = cf.symbols.CFStringGetCString(
    cfString,
    buf,
    BigInt(buf.byteLength),
    kCFStringEncodingUTF8
  );
  if (!ok) return '<unrepresentable>';
  const end = buf.indexOf(0);
  return textDecoder.decode(buf.subarray(0, end === -1 ? buf.byteLength : end));
}

/** Extract raw bytes from a CFData. */
function cfDataToBytes(cfData: bigint): Uint8Array {
  const length = Number(cf.symbols.CFDataGetLength(cfData));
  if (length === 0) return new Uint8Array();
  const bytePtr = cf.symbols.CFDataGetBytePtr(cfData);
  if (bytePtr === 0n) {
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error('CFDataGetBytePtr returned NULL'),
    });
  }
  // CFData storage is a real heap pointer (never tagged), so the
  // BigInt value fits in JS safe integer range and we can hand it to
  // toArrayBuffer via Number. Copy into JS-owned memory so we don't
  // retain the CFData longer than necessary.
  const view = new Uint8Array(toArrayBuffer(Number(bytePtr) as unknown as never, 0, length));
  return new Uint8Array(view);
}

/** Build a mutable CFDictionary. */
function cfMutableDict(pool: CFPool): bigint {
  const dict = cf.symbols.CFDictionaryCreateMutable(
    0n,
    0n,
    K.kCFTypeDictionaryKeyCallBacks,
    K.kCFTypeDictionaryValueCallBacks
  );
  if (dict === 0n) {
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error('CFDictionaryCreateMutable returned NULL'),
    });
  }
  return pool.retain(dict);
}

function cfDictSet(dict: bigint, key: bigint, value: bigint): void {
  cf.symbols.CFDictionaryAddValue(dict, key, value);
}

// -----------------------------------------------------------------------------
// Store implementation
// -----------------------------------------------------------------------------

function validateSpecifier(service: string, user: string): void {
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
  if (service.includes('\0') || user.includes('\0')) {
    throw new KeyringError({
      kind: 'Invalid',
      param: service.includes('\0') ? 'service' : 'user',
      reason: 'must not contain NUL bytes',
    });
  }
}

function defaultLabel(service: string, user: string): string {
  return `keyring:${user}@${service}`;
}

export class MacOSSecurityFFIStore implements CredentialStore {
  readonly id = 'macos-security-ffi';
  readonly vendor = 'Apple Security.framework (via bun:ffi SecItem*)';

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
    if (modifiers.keychain !== undefined && modifiers.keychain !== 'User') {
      throw new KeyringError({
        kind: 'NotSupportedByStore',
        operation: `macos keychain domain "${modifiers.keychain}"`,
      });
    }

    // Writes delegate to `/usr/bin/security add-generic-password -A`
    // (subprocess) because that is the ONLY path that reliably produces
    // a genuine allow-any ACL. The Security.framework APIs
    // (SecAccessCreate + SecACLSetSimpleContents with NULL
    // applicationList + zero selector) should theoretically produce the
    // same result, but in practice the items they produce still trigger
    // the macOS trust dialog ("X wants to access key Y") when read
    // from a different binary. Apple's `security` CLI uses internal
    // codepaths that bypass this limitation.
    //
    // The write happens once per login/migration — its ~25ms cost is
    // irrelevant relative to the network round-trip that follows. The
    // hot path (reads on every `composio execute`) stays on FFI at
    // ~1ms via SecItemCopyMatching.
    const encoded = encodeSecret(secret);
    const label = modifiers.label ?? defaultLabel(service, user);

    // Delete-then-add pattern instead of `-U` (update-if-exists).
    //
    // `-U` updates the password but PRESERVES the old ACL. If the
    // entry was previously created by the FFI ACL builder (which
    // produces per-binary ACLs — see the long comment block above),
    // the old broken ACL survives the `-U` update and the allow-any
    // flag from `-A` is silently ignored. Deleting first guarantees
    // the new `add-generic-password -A` creates a fresh entry with
    // a genuine allow-any ACL.
    //
    // The delete is best-effort — if the entry doesn't exist yet
    // (first login), the delete fails with errSecItemNotFound (exit
    // 44) and we proceed to the add.
    try {
      await runCommand({
        command: SECURITY_BIN,
        args: ['delete-generic-password', '-a', user, '-s', service],
      });
    } catch {
      // Spawn failure is fine — entry may not exist.
    }

    // `-A`  = allow any application to read without prompting
    // `-l`  = human-readable label (shown in Keychain Access)
    // `-w`  = password value (on argv — brief `ps` visibility,
    //         documented in the package README)
    const args = [
      'add-generic-password',
      '-A',
      '-a',
      user,
      '-s',
      service,
      '-l',
      label,
      '-w',
      encoded,
    ];

    let result;
    try {
      result = await runCommand({ command: SECURITY_BIN, args });
    } catch (err) {
      throw new KeyringError({ kind: 'NoStorageAccess', cause: err });
    }

    if (result.code === 0) return;

    const stderr = bytesToUtf8(result.stderr).trim();
    throw new KeyringError({
      kind: 'PlatformFailure',
      cause: new Error(stderr || `security add-generic-password failed with exit ${result.code}`),
    });
  }

  async getSecret(service: string, user: string, modifiers: EntryModifiers): Promise<Uint8Array> {
    validateSpecifier(service, user);
    if (modifiers.keychain !== undefined && modifiers.keychain !== 'User') {
      throw new KeyringError({
        kind: 'NotSupportedByStore',
        operation: `macos keychain domain "${modifiers.keychain}"`,
      });
    }

    const pool = new CFPool();
    try {
      const query = cfMutableDict(pool);
      cfDictSet(query, K.kSecClass, K.kSecClassGenericPassword);
      cfDictSet(query, K.kSecAttrService, cfStringFromJs(pool, service));
      cfDictSet(query, K.kSecAttrAccount, cfStringFromJs(pool, user));
      cfDictSet(query, K.kSecReturnData, K.kCFBooleanTrue);
      cfDictSet(query, K.kSecMatchLimit, K.kSecMatchLimitOne);

      // SecItemCopyMatching writes a CFTypeRef (here: CFDataRef because
      // kSecReturnData=true, kSecMatchLimit=One) into the 8-byte slot.
      const resultOut = new Uint8Array(8);
      const status = sec.symbols.SecItemCopyMatching(query, BigInt(ptr(resultOut)));
      if (status !== errSecSuccess) {
        throw osStatusToError(status, 'SecItemCopyMatching');
      }
      const cfData = new DataView(resultOut.buffer).getBigUint64(0, true);
      if (cfData === 0n) {
        throw new KeyringError({ kind: 'NoEntry' });
      }
      try {
        const encoded = cfDataToBytes(cfData);
        // Legacy-item compatibility: if this entry was written by a
        // pre-base64 version of the FFI backend, the bytes won't have
        // the `b64:` prefix. `decodeSecret` throws in that case; we
        // fall back to returning the raw bytes so one-time reads of
        // old entries still work (the next setPassword call
        // rewrites them in the canonical format).
        try {
          return decodeSecret(bytesToUtf8(encoded));
        } catch {
          return encoded;
        }
      } finally {
        cf.symbols.CFRelease(cfData);
      }
    } finally {
      pool.release();
    }
  }

  async deleteCredential(service: string, user: string, modifiers: EntryModifiers): Promise<void> {
    validateSpecifier(service, user);
    if (modifiers.keychain !== undefined && modifiers.keychain !== 'User') {
      throw new KeyringError({
        kind: 'NotSupportedByStore',
        operation: `macos keychain domain "${modifiers.keychain}"`,
      });
    }

    const pool = new CFPool();
    try {
      const query = cfMutableDict(pool);
      cfDictSet(query, K.kSecClass, K.kSecClassGenericPassword);
      cfDictSet(query, K.kSecAttrService, cfStringFromJs(pool, service));
      cfDictSet(query, K.kSecAttrAccount, cfStringFromJs(pool, user));

      const status = sec.symbols.SecItemDelete(query);
      if (status !== errSecSuccess) {
        throw osStatusToError(status, 'SecItemDelete');
      }
    } finally {
      pool.release();
    }
  }
}
