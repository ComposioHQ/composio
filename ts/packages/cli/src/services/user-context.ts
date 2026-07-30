import { FileSystem, Path } from '@effect/platform';
import { Context, Data, Effect, Layer, Option, Predicate, Random, Schema } from 'effect';
import {
  type UserDataWithDefaults,
  UserData,
  userDataFromJSON,
  userDataToJSON,
} from 'src/models/user-data';
import { JsonRecordSchema } from 'src/effects/json';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import * as constants from 'src/constants';
import type { PlatformError } from '@effect/platform/Error';
import type { ParseError } from 'effect/ParseResult';
import { APP_CONFIG } from 'src/effects/app-config';
import { KeyringService, KeyringLiveWithBackend } from '@composio/cli-keyring/effect';
import type { KeyringServiceShape } from '@composio/cli-keyring/effect';
import { KeyringError, type MacOSBackend } from '@composio/cli-keyring';
import type { SecurityBackend } from 'src/models/cli-user-config';
import { ComposioCliUserConfig, ComposioCliUserConfigLive } from 'src/services/cli-user-config';

/**
 * Keyring specifier for the Composio API key. `service` is a reverse
 * DNS identifier shared by every composio CLI install; `user` is a
 * single fixed slot because the API key is user-scoped (one per
 * logged-in account, independent of which org/project the user is
 * currently working in).
 *
 * These values are part of the on-disk contract: credentials written
 * by earlier opt-in `keychain` / `keychain-subprocess` installs must
 * stay readable now that `auto` is keyring-backed.
 */
export const KEYRING_SERVICE = 'com.composio.cli';
export const KEYRING_USER = 'default';

/**
 * Where the resolved API key came from. Tracked so later metadata
 * writes reproduce the right on-disk representation instead of
 * silently changing which copy of the credential is authoritative.
 */
export type CredentialSource = 'environment' | 'plaintext' | 'keyring' | 'none';

/** How this process persists the API key, derived from `security`. */
type StorageMode = 'keyring' | 'json';

const storageModeFor = (security: SecurityBackend): StorageMode =>
  security === 'json' ? 'json' : 'keyring';

/**
 * Raised when a new login cannot be stored anywhere that survives the
 * process — neither the OS credential store nor `user_data.json`.
 */
export class CredentialPersistenceError extends Data.TaggedError('CredentialPersistenceError')<{
  readonly keyringStored: boolean;
  readonly cause: unknown;
}> {
  get message(): string {
    const detail = this.keyringStored
      ? 'the OS credential store accepted the key, but the pending-logout marker in user_data.json could not be cleared'
      : 'neither the OS credential store nor user_data.json could store the key';
    return (
      `Could not save your Composio credentials: ${detail}. ` +
      'Check that ~/.composio is writable, then run `composio login` again.'
    );
  }
}

const decodeUserDataJsonObject = Schema.decodeUnknown(Schema.parseJson(JsonRecordSchema));

/**
 * Drop fields whose default value carries no information, so a file
 * with no plaintext fallback and no pending logout looks exactly like
 * one written by a CLI that predates those markers.
 */
const normalizeEncodedUserData = (encoded: string) =>
  Effect.gen(function* () {
    const decoded = yield* decodeUserDataJsonObject(encoded);
    const parsed = { ...decoded };
    if (parsed.project_id === null) delete parsed.project_id;
    if (parsed.api_key_fallback === false) delete parsed.api_key_fallback;
    if (parsed.pending_keyring_logout === false) delete parsed.pending_keyring_logout;
    return JSON.stringify(parsed);
  });

// -----------------------------------------------------------------------------
// Keyring helpers
//
// None of these ever propagate a failure: an unreachable credential
// store must degrade to the plaintext fallback, never fail the CLI.
// Diagnostics name the error category only — never the key itself.
// -----------------------------------------------------------------------------

type KeyringDeps = {
  keyring: KeyringServiceShape;
  /** `false` in `security: "json"`, which must not touch the store. */
  enabled: boolean;
};

const describeKeyringError = (err: unknown): string =>
  err instanceof KeyringError
    ? err.kind
    : Predicate.isError(err)
      ? err.name
      : 'UnknownKeyringFailure';

/**
 * Write `password` into the OS keyring. Returns `true` only when the
 * store confirmed the write.
 */
const writeKeyring = (deps: KeyringDeps, password: string) =>
  Effect.gen(function* () {
    if (!deps.enabled) return false;
    return yield* deps.keyring.setPassword(KEYRING_SERVICE, KEYRING_USER, password).pipe(
      Effect.as(true),
      Effect.catchAll(err =>
        Effect.logDebug(
          `Keyring write failed (${describeKeyringError(err)}); ` +
            'keeping the API key in user_data.json instead'
        ).pipe(Effect.as(false))
      )
    );
  });

/**
 * Read the API key from the OS keyring. `Option.none()` covers both
 * "no entry" and "store unreachable" — the caller treats each as
 * "no keyring-backed credential".
 */
const readKeyring = (deps: KeyringDeps) =>
  Effect.gen(function* () {
    if (!deps.enabled) return Option.none<string>();
    return yield* deps.keyring.getPassword(KEYRING_SERVICE, KEYRING_USER).pipe(
      Effect.map(Option.some),
      Effect.catchAll(err =>
        Effect.logDebug(`No keyring-backed API key available (${describeKeyringError(err)})`).pipe(
          Effect.as(Option.none<string>())
        )
      )
    );
  });

/**
 * Delete the keyring credential. Returns `true` when the credential is
 * confirmed gone — either deleted, or absent to begin with. A `false`
 * result means the store rejected the delete and the caller must leave
 * a marker so a later process retries.
 *
 * Runs even in `security: "json"`, because a user may have switched
 * modes after storing a secure credential.
 */
const deleteKeyring = (keyring: KeyringServiceShape) =>
  keyring.deleteCredential(KEYRING_SERVICE, KEYRING_USER).pipe(
    Effect.as(true),
    Effect.catchAll(err =>
      err instanceof KeyringError && err.kind === 'NoEntry'
        ? Effect.succeed(true)
        : Effect.logWarning(
            `Could not remove the stored Composio credential (${describeKeyringError(err)}); ` +
              'the CLI will retry on the next run'
          ).pipe(Effect.as(false))
    )
  );

// -----------------------------------------------------------------------------
// Credential state
//
// `userData.apiKey` is what commands authenticate with; `plaintextApiKey`
// is what `user_data.json` must contain. They differ whenever the key
// lives in the keyring or in the environment, and keeping them apart is
// what stops a metadata write from deleting the only durable copy of a
// credential.
// -----------------------------------------------------------------------------

type CredentialState = {
  userData: UserData;
  plaintextApiKey: Option.Option<string>;
  plaintextIsFallback: boolean;
  pendingKeyringLogout: boolean;
  source: CredentialSource;
};

type UserDataFile = {
  readonly fs: FileSystem.FileSystem;
  readonly filePath: string;
};

/** Resolved environment inputs that always override stored values. */
type ContextEnvironment = {
  readonly envApiKey: Option.Option<string>;
  readonly baseURL: string;
  readonly webURL: string;
};

/**
 * Replace `user_data.json` atomically: write a sibling temp file,
 * tighten its permissions when it carries a plaintext credential, then
 * rename over the target. A failure anywhere leaves the previous
 * complete file in place.
 */
const persistUserData = (file: UserDataFile, state: CredentialState) =>
  Effect.gen(function* () {
    const holdsPlaintextKey = Option.isSome(state.plaintextApiKey);
    const onDisk: UserData = {
      ...state.userData,
      apiKey: state.plaintextApiKey,
      apiKeyFallback: holdsPlaintextKey && state.plaintextIsFallback,
      pendingKeyringLogout: state.pendingKeyringLogout,
    };
    const encoded = yield* userDataToJSON(onDisk);
    const normalized = yield* normalizeEncodedUserData(encoded);

    const nonce = yield* Random.nextIntBetween(0, 2_176_782_336);
    const tempPath = `${file.filePath}.${nonce.toString(36)}.tmp`;

    yield* file.fs.writeFileString(tempPath, normalized).pipe(
      // Owner-only, because this file now holds the API key.
      Effect.andThen(holdsPlaintextKey ? file.fs.chmod(tempPath, 0o600) : Effect.void),
      Effect.andThen(file.fs.rename(tempPath, file.filePath)),
      Effect.onError(() => file.fs.remove(tempPath).pipe(Effect.ignore))
    );
  });

/** `persistUserData`, reduced to a boolean so callers can branch on it. */
const tryPersistUserData = (file: UserDataFile, state: CredentialState) =>
  persistUserData(file, state).pipe(
    Effect.as(true),
    Effect.catchAll(() =>
      Effect.logDebug(`Could not write ${constants.USER_CONFIG_FILE_NAME}`).pipe(Effect.as(false))
    )
  );

const loadUserDataFile = (file: UserDataFile, state: CredentialState, env: ContextEnvironment) =>
  Effect.gen(function* () {
    const raw = yield* file.fs.readFileString(file.filePath, 'utf8');
    const parsed = yield* userDataFromJSON(raw);

    state.plaintextApiKey = parsed.apiKey;
    state.plaintextIsFallback = parsed.apiKeyFallback;
    state.pendingKeyringLogout = parsed.pendingKeyringLogout;
    state.userData = {
      ...state.userData,
      ...parsed,
      apiKey: env.envApiKey.pipe(Option.orElse(() => parsed.apiKey)),
      baseURL: Option.some(env.baseURL),
      webURL: Option.some(env.webURL),
    } satisfies UserData;
  });

/**
 * Move a plaintext key into the keyring. The plaintext copy stays
 * authoritative until *both* the secure write and the scrub succeed, so
 * an interrupted migration can never destroy the only durable copy of
 * the credential.
 */
const migratePlaintextToKeyring = (
  file: UserDataFile,
  state: CredentialState,
  deps: KeyringDeps,
  key: string
) =>
  Effect.gen(function* () {
    state.source = 'plaintext';
    if (!(yield* writeKeyring(deps, key))) return;

    const previousMarker = state.plaintextIsFallback;
    state.plaintextApiKey = Option.none();
    state.plaintextIsFallback = false;

    if (yield* tryPersistUserData(file, state)) {
      state.source = 'keyring';
      yield* Effect.logDebug('Moved the Composio API key into the OS credential store');
      return;
    }

    state.plaintextApiKey = Option.some(key);
    state.plaintextIsFallback = previousMarker;
  });

/**
 * A pending-logout marker outranks anything in the credential store:
 * logout already succeeded from the user's point of view, and only the
 * secure delete is outstanding.
 */
const resumePendingLogout = (
  file: UserDataFile,
  state: CredentialState,
  keyring: KeyringServiceShape
) =>
  Effect.gen(function* () {
    state.userData = { ...state.userData, apiKey: Option.none() };
    state.plaintextApiKey = Option.none();
    state.plaintextIsFallback = false;
    state.source = 'none';

    state.pendingKeyringLogout = !(yield* deleteKeyring(keyring));
    yield* tryPersistUserData(file, state);
  });

const resolveCredential = (
  file: UserDataFile,
  state: CredentialState,
  deps: KeyringDeps,
  storageMode: StorageMode,
  env: ContextEnvironment
) =>
  Effect.gen(function* () {
    // An environment key wins outright and must not trigger any storage
    // read, write, or migration.
    if (Option.isSome(env.envApiKey)) {
      state.source = 'environment';
      return;
    }

    if (state.pendingKeyringLogout) {
      yield* resumePendingLogout(file, state, deps.keyring);
      return;
    }

    if (storageMode === 'json') {
      state.source = Option.isSome(state.plaintextApiKey) ? 'plaintext' : 'none';
      return;
    }

    if (Option.isSome(state.plaintextApiKey)) {
      yield* migratePlaintextToKeyring(file, state, deps, state.plaintextApiKey.value);
      return;
    }

    const fromKeyring = yield* readKeyring(deps);
    if (Option.isSome(fromKeyring)) {
      state.userData = { ...state.userData, apiKey: fromKeyring };
      state.source = 'keyring';
    }
  });

// -----------------------------------------------------------------------------
// Service definition
// -----------------------------------------------------------------------------

export class ComposioUserContext extends Context.Tag('ComposioUserData')<
  ComposioUserContext,
  {
    readonly data: UserDataWithDefaults;
    isLoggedIn: () => boolean;
    /** Where the active credential was resolved from. */
    credentialSource: () => CredentialSource;
    logout: Effect.Effect<void, ParseError | PlatformError, never>;
    login: (
      apiKey: string,
      orgId?: string,
      testUserId?: string
    ) => Effect.Effect<void, ParseError | PlatformError | CredentialPersistenceError, never>;
    update: (data: Partial<UserData>) => Effect.Effect<void, ParseError | PlatformError, never>;
  }
>() {}

export const rawComposioUserContextLive = Layer.effect(
  ComposioUserContext,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const envApiKey = yield* APP_CONFIG['USER_API_KEY'];
    const baseURL = yield* APP_CONFIG['BASE_URL'];
    const webURL = yield* APP_CONFIG['WEB_URL'];
    const cliConfig = yield* ComposioCliUserConfig;
    const keyring = yield* KeyringService;

    const env: ContextEnvironment = { envApiKey, baseURL, webURL };
    const storageMode = storageModeFor(cliConfig.data.security);
    const kDeps: KeyringDeps = { keyring, enabled: storageMode === 'keyring' };

    const cacheDir = yield* setupCacheDir;
    const file: UserDataFile = {
      fs,
      filePath: path.join(cacheDir, constants.USER_CONFIG_FILE_NAME),
    };

    const state: CredentialState = {
      userData: UserData.make({
        apiKey: envApiKey,
        baseURL: Option.some(baseURL),
        webURL: Option.some(webURL),
        orgId: Option.none(),
        projectId: Option.none(),
        testUserId: Option.none(),
      }),
      plaintextApiKey: Option.none(),
      plaintextIsFallback: false,
      pendingKeyringLogout: false,
      source: Option.isSome(envApiKey) ? 'environment' : 'none',
    };

    if (yield* fs.exists(file.filePath)) {
      yield* loadUserDataFile(file, state, env).pipe(
        Effect.catchAll(() =>
          Effect.logDebug(
            `${constants.USER_CONFIG_FILE_NAME} is empty or corrupted; resetting to defaults`
          ).pipe(Effect.zipRight(persistUserData(file, state)))
        )
      );
    } else {
      yield* persistUserData(file, state);
    }

    yield* resolveCredential(file, state, kDeps, storageMode, env);

    const logout = Effect.gen(function* () {
      const secureDeleteConfirmed = yield* deleteKeyring(keyring);

      state.userData = {
        apiKey: Option.none(),
        baseURL: Option.none(),
        webURL: Option.some(webURL),
        orgId: Option.none(),
        projectId: Option.none(),
        testUserId: Option.none(),
        apiKeyFallback: false,
        pendingKeyringLogout: false,
      };
      // Mask every stored credential immediately, even when the secure
      // delete could not be confirmed; the marker drives the retry.
      state.plaintextApiKey = Option.none();
      state.plaintextIsFallback = false;
      state.pendingKeyringLogout = !secureDeleteConfirmed;
      state.source = 'none';

      yield* persistUserData(file, state);
    });

    const login = (apiKey: string, orgId?: string, testUserId?: string) =>
      Effect.gen(function* () {
        const storedInKeyring = yield* writeKeyring(kDeps, apiKey);
        const previous = { ...state };

        state.userData = {
          ...state.userData,
          apiKey: Option.some(apiKey),
          baseURL: Option.some(baseURL),
          webURL: Option.some(webURL),
          orgId: Option.fromNullable(orgId),
          projectId: state.userData.projectId,
          testUserId: Option.fromNullable(testUserId),
        };
        state.plaintextApiKey = storedInKeyring ? Option.none() : Option.some(apiKey);
        state.plaintextIsFallback = !storedInKeyring;
        state.pendingKeyringLogout = false;
        state.source = storedInKeyring ? 'keyring' : 'plaintext';

        const persisted = yield* tryPersistUserData(file, state);

        // The login survives this process when the keyring accepted the
        // key and no pending-logout marker is left behind to revoke it,
        // or when the plaintext fallback reached disk.
        const durable = storedInKeyring ? !previous.pendingKeyringLogout || persisted : persisted;
        if (durable) return;

        // The atomic write left the previous file intact, so restore the
        // in-memory view to match what a later process will read.
        Object.assign(state, previous);

        return yield* new CredentialPersistenceError({
          keyringStored: storedInKeyring,
          cause: `could not write ${file.filePath}`,
        });
      });

    /**
     * Non-secret metadata update. `persistUserData` derives the
     * credential fields from the tracked state, so a caller cannot
     * change which copy of the key is authoritative, drop an active
     * plaintext fallback, or clear a pending logout through this path.
     */
    const update = (data: Partial<UserData>) =>
      Effect.gen(function* () {
        state.userData = { ...state.userData, ...data } satisfies UserData;
        yield* persistUserData(file, state);
      });

    const snapshot = (): UserDataWithDefaults => ({
      ...state.userData,
      baseURL: Option.getOrElse(state.userData.baseURL, () => baseURL),
      webURL: Option.getOrElse(state.userData.webURL, () => webURL),
      orgId: state.userData.orgId,
      projectId: state.userData.projectId,
      testUserId: state.userData.testUserId,
      apiKeyFallback: state.source === 'plaintext' && state.plaintextIsFallback,
      pendingKeyringLogout: state.pendingKeyringLogout,
    });

    return ComposioUserContext.of({
      get data() {
        return snapshot();
      },
      isLoggedIn: () => Option.isSome(state.userData.apiKey),
      credentialSource: () => state.source,
      update,
      login,
      logout,
    });
  })
);

/**
 * Map the config's `security` field onto the cli-keyring package's
 * `MacOSBackend` parameter.
 *
 * Only `"keychain"` opts into the FFI path, which needs a Developer
 * ID-signed binary to avoid a macOS trust dialog. Every other value —
 * including the `"auto"` default — uses the subprocess backend, which
 * shells out to Apple-signed `/usr/bin/security` and prompts for
 * nothing. `"json"` never reaches the store during load, login, or
 * update, but still builds a usable one so logout can clean up
 * credentials left by an earlier keyring-backed mode.
 */
export const resolveMacOSBackend = (security: SecurityBackend): MacOSBackend =>
  security === 'keychain' ? 'ffi' : 'auto';

/**
 * Public layer that pre-provides the keyring and CLI-config deps,
 * leaving only `FileSystem` and `Path` as external requirements.
 *
 * This resolves the *real* platform credential store. Tests must build
 * `rawComposioUserContextLive` over a fake `KeyringService` instead —
 * see `test/__utils__/services/user-context.ts`.
 */
export const ComposioUserContextLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const cliConfig = yield* ComposioCliUserConfig;
    const backend = resolveMacOSBackend(cliConfig.data.security);
    return Layer.provide(
      rawComposioUserContextLive,
      Layer.mergeAll(KeyringLiveWithBackend(backend), ComposioCliUserConfigLive)
    );
  }).pipe(Effect.provide(ComposioCliUserConfigLive))
);
