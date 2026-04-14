/**
 * Error model for `@composio/cli-keyring`.
 *
 * Mirrors the 11-variant enum from `keyring-core/src/error.rs` in
 * https://github.com/open-source-cooperative/keyring-core so that this
 * package can act as a structural TypeScript port of keyring-rs for the
 * backends we care about (macOS Keychain via `security`, Linux Secret
 * Service via `secret-tool`).
 */

import type { Entry } from './entry';

/**
 * Discriminated union of every error condition a `CredentialStore` may
 * surface. Prefer pattern-matching on `kind` rather than catching
 * `KeyringError` generically so handlers remain explicit about what they
 * tolerate (`NoEntry` on first login, for example).
 */
export type KeyringErrorDetails =
  /** The underlying store returned an unexpected runtime failure. */
  | { readonly kind: 'PlatformFailure'; readonly cause: unknown }
  /**
   * The store is present but inaccessible: keychain locked, D-Bus
   * session missing, user declined an unlock prompt, `secret-tool`
   * not installed, etc. Callers should treat this as "try a fallback
   * or warn the user" rather than "retry".
   */
  | { readonly kind: 'NoStorageAccess'; readonly cause: unknown }
  /** No credential exists for the (service, user) specifier. */
  | { readonly kind: 'NoEntry' }
  /** Retrieved bytes were not valid UTF-8 (only raised by `getPassword`). */
  | { readonly kind: 'BadEncoding'; readonly bytes: Uint8Array }
  /** Retrieved bytes didn't match the store's expected blob format. */
  | { readonly kind: 'BadDataFormat'; readonly bytes: Uint8Array; readonly cause: unknown }
  /** Store metadata itself is corrupted. */
  | { readonly kind: 'BadStoreFormat'; readonly detail: string }
  /** An attribute value exceeded the platform length limit. */
  | { readonly kind: 'TooLong'; readonly attr: string; readonly limit: number }
  /**
   * A parameter violated a store-specific rule — e.g. an empty `service`
   * or `user` on macOS (empty strings act as wildcards in Keychain
   * Services and must be rejected locally before we spawn).
   */
  | { readonly kind: 'Invalid'; readonly param: string; readonly reason: string }
  /**
   * Multiple credentials matched the (service, user) specifier. Only
   * possible on Secret Service; generic-password items on macOS are
   * unique per (service, account, keychain).
   */
  | { readonly kind: 'Ambiguous'; readonly matches: readonly Entry[] }
  /** No process-global default store has been registered. */
  | { readonly kind: 'NoDefaultStore' }
  /** The active store does not implement the requested operation. */
  | { readonly kind: 'NotSupportedByStore'; readonly operation: string };

export type KeyringErrorKind = KeyringErrorDetails['kind'];

/**
 * The single error type thrown by every operation on `Entry` or a
 * `CredentialStore`. `details` carries the variant-specific payload;
 * the base `message` is derived for human logs but callers should
 * branch on `details.kind`.
 */
export class KeyringError extends Error {
  readonly details: KeyringErrorDetails;

  constructor(details: KeyringErrorDetails) {
    super(KeyringError.formatMessage(details));
    this.name = 'KeyringError';
    this.details = details;
    // Preserve the original cause chain for PlatformFailure / NoStorageAccess
    // so `console.error(err)` prints the underlying reason.
    if ('cause' in details && details.cause !== undefined) {
      (this as { cause?: unknown }).cause = details.cause;
    }
  }

  get kind(): KeyringErrorKind {
    return this.details.kind;
  }

  /**
   * Convenience predicate — avoids `err instanceof KeyringError && err.kind === 'NoEntry'`
   * at every call site.
   */
  is<K extends KeyringErrorKind>(
    kind: K
  ): this is KeyringError & { readonly details: Extract<KeyringErrorDetails, { kind: K }> } {
    return this.details.kind === kind;
  }

  private static formatMessage(d: KeyringErrorDetails): string {
    switch (d.kind) {
      case 'NoEntry':
        return 'No matching credential was found in the store.';
      case 'NoDefaultStore':
        return 'No default keyring store has been registered for this process.';
      case 'PlatformFailure':
        return `Keyring store failure: ${describe(d.cause)}`;
      case 'NoStorageAccess':
        return `Keyring store is unavailable: ${describe(d.cause)}`;
      case 'BadEncoding':
        return `Stored credential is not valid UTF-8 (${d.bytes.byteLength} bytes).`;
      case 'BadDataFormat':
        return `Stored credential is malformed: ${describe(d.cause)}`;
      case 'BadStoreFormat':
        return `Credential store metadata is corrupted: ${d.detail}`;
      case 'TooLong':
        return `Attribute "${d.attr}" exceeds the platform limit of ${d.limit} bytes.`;
      case 'Invalid':
        return `Invalid parameter "${d.param}": ${d.reason}`;
      case 'Ambiguous':
        return `Credential specifier matched ${d.matches.length} items; expected exactly one.`;
      case 'NotSupportedByStore':
        return `Operation "${d.operation}" is not supported by the active keyring store.`;
    }
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
