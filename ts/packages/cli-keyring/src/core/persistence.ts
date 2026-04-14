/**
 * Lifetime of credentials held by a store.
 *
 * Mirrors `keyring_core::api::CredentialPersistence`. Clients can query
 * `store.persistence()` to warn users when credentials will be lost on
 * logout (e.g. keyutils) vs. persisted to disk (macOS Keychain, Secret
 * Service).
 */
export const CredentialPersistence = {
  /** Credentials exist only for the lifetime of an `Entry` handle. */
  EntryOnly: 'EntryOnly',
  /** Credentials are wiped when the process exits. */
  ProcessOnly: 'ProcessOnly',
  /** Credentials persist until the user logs out of the session. */
  UntilLogout: 'UntilLogout',
  /** Credentials persist until the machine is rebooted. */
  UntilReboot: 'UntilReboot',
  /** Credentials persist until explicitly deleted. */
  UntilDelete: 'UntilDelete',
  /** Persistence characteristics are unknown. */
  Unspecified: 'Unspecified',
} as const;

export type CredentialPersistence =
  (typeof CredentialPersistence)[keyof typeof CredentialPersistence];
