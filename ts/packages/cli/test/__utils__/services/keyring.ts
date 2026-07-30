/**
 * Fake `KeyringService` layers for CLI tests.
 *
 * Every test that builds a CLI service stack must inject one of these.
 * `ComposioUserContext` reaches for the OS credential store in every
 * mode except `security: "json"`, so a test without a fake would read,
 * write, and delete the developer's real macOS Keychain / Secret
 * Service entry.
 *
 * `makeFakeKeyring` returns a *fresh* store per call — no module-level
 * map is shared between tests. Each fake also records the ordered list
 * of operations it received so tests can assert that, for example, a
 * migration wrote to the keyring before scrubbing plaintext.
 */

import { Layer } from 'effect';
import {
  KeyringService,
  makeKeyringService,
  type KeyringServiceShape,
} from '@composio/cli-keyring/effect';
import {
  CredentialPersistence,
  KeyringError,
  type CredentialStore,
  type EntryModifiers,
  type KeyringErrorDetails,
} from '@composio/cli-keyring';

/**
 * Store-level operations, which map one-to-one onto the
 * `KeyringService` password methods the CLI actually calls:
 * `getPassword` -> `get`, `setPassword` -> `set`,
 * `deleteCredential` -> `delete`.
 */
export type KeyringOperation = 'get' | 'set' | 'delete';

export interface KeyringCall {
  readonly operation: KeyringOperation;
  readonly service: string;
  readonly user: string;
}

/**
 * Outcome for a single scripted call. `null` lets the call run against
 * the in-memory map; a `KeyringErrorDetails` makes it reject with that
 * typed `KeyringError`.
 */
export type KeyringOutcome = KeyringErrorDetails | null;

export interface FakeKeyringOptions {
  /** Credentials present before the test starts. */
  readonly seed?: ReadonlyArray<readonly [service: string, user: string, password: string]>;

  /**
   * Per-operation outcomes, consumed one entry per call in order. Once
   * an operation's script is exhausted, later calls fall through to
   * `alwaysFail` and then to the in-memory map.
   */
  readonly script?: Partial<Record<KeyringOperation, ReadonlyArray<KeyringOutcome>>>;

  /** Outcome applied to every unscripted call of an operation. */
  readonly alwaysFail?: Partial<Record<KeyringOperation, KeyringErrorDetails>>;
}

export interface FakeKeyring {
  /** Layer to merge into the service stack under test. */
  readonly layer: Layer.Layer<KeyringService>;
  readonly service: KeyringServiceShape;
  readonly store: CredentialStore;

  /** Live, ordered log of every operation this fake received. */
  readonly calls: ReadonlyArray<KeyringCall>;

  /** Just the operation names, for terse call-order assertions. */
  readonly operations: () => ReadonlyArray<KeyringOperation>;

  /** Read the stored password without recording a call. */
  readonly peek: (service: string, user: string) => string | undefined;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const specifier = (service: string, user: string) => `${service}\u0000${user}`;

/**
 * Build a fresh in-memory keyring with an independent credential map
 * and call log. Pass `script` / `alwaysFail` to make specific
 * operations reject with typed `KeyringError` values.
 */
export const makeFakeKeyring = (options: FakeKeyringOptions = {}): FakeKeyring => {
  const secrets = new Map<string, Uint8Array>();
  for (const [service, user, password] of options.seed ?? []) {
    secrets.set(specifier(service, user), encoder.encode(password));
  }

  const calls: KeyringCall[] = [];
  const scripts = new Map<KeyringOperation, KeyringOutcome[]>(
    Object.entries(options.script ?? {}).map(([operation, outcomes]) => [
      operation as KeyringOperation,
      [...outcomes],
    ])
  );

  /**
   * Record the call and apply any scripted outcome. Throws inside an
   * `async` store method, so the caller sees a rejected promise and
   * `Effect.tryPromise` surfaces the typed `KeyringError`.
   */
  const record = (operation: KeyringOperation, service: string, user: string): void => {
    calls.push({ operation, service, user });

    const queue = scripts.get(operation);
    const scripted = queue !== undefined && queue.length > 0 ? queue.shift() : undefined;
    const outcome = scripted === undefined ? (options.alwaysFail?.[operation] ?? null) : scripted;

    if (outcome !== null) {
      throw new KeyringError(outcome);
    }
  };

  const store: CredentialStore = {
    id: 'fake',
    vendor: 'composio-cli-tests',
    persistence: () => CredentialPersistence.ProcessOnly,

    async setSecret(service: string, user: string, secret: Uint8Array, _modifiers: EntryModifiers) {
      record('set', service, user);
      secrets.set(specifier(service, user), new Uint8Array(secret));
    },

    async getSecret(service: string, user: string, _modifiers: EntryModifiers) {
      record('get', service, user);
      const stored = secrets.get(specifier(service, user));
      if (stored === undefined) {
        throw new KeyringError({ kind: 'NoEntry' });
      }
      return stored;
    },

    async deleteCredential(service: string, user: string, _modifiers: EntryModifiers) {
      record('delete', service, user);
      if (!secrets.delete(specifier(service, user))) {
        throw new KeyringError({ kind: 'NoEntry' });
      }
    },
  };

  const service = makeKeyringService(store);

  return {
    layer: Layer.succeed(KeyringService, service),
    service,
    store,
    calls,
    operations: () => calls.map(call => call.operation),
    peek: (service_: string, user: string) => {
      const stored = secrets.get(specifier(service_, user));
      return stored === undefined ? undefined : decoder.decode(stored);
    },
  };
};

/**
 * Keyring that is unreachable for every operation — the headless Linux
 * / locked-keychain shape. The CLI must stay usable through the
 * plaintext `user_data.json` fallback.
 */
export const makeUnavailableKeyring = (): FakeKeyring =>
  makeFakeKeyring({
    alwaysFail: {
      get: { kind: 'NoStorageAccess', cause: new Error('no credential store in this environment') },
      set: { kind: 'NoStorageAccess', cause: new Error('no credential store in this environment') },
      delete: {
        kind: 'NoStorageAccess',
        cause: new Error('no credential store in this environment'),
      },
    },
  });

/** Convenience layer for tests that never assert on keyring calls. */
export const FakeKeyringLayer = (options?: FakeKeyringOptions): Layer.Layer<KeyringService> =>
  makeFakeKeyring(options).layer;
