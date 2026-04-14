import { FileSystem } from '@effect/platform';
import { Effect, Context, Layer, Option } from 'effect';
import path from 'path';
import {
  type UserDataWithDefaults,
  UserData,
  userDataFromJSON,
  userDataToJSON,
} from 'src/models/user-data';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import * as constants from 'src/constants';
import type { PlatformError } from '@effect/platform/Error';
import type { ParseError } from 'effect/ParseResult';
import { APP_CONFIG } from 'src/effects/app-config';
import { KeyringService, KeyringLiveWithBackend } from '@composio/cli-keyring/effect';
import type { KeyringServiceShape } from '@composio/cli-keyring/effect';
import { KeyringError, type MacOSBackend } from '@composio/cli-keyring';
import { ComposioCliUserConfig, ComposioCliUserConfigLive } from 'src/services/cli-user-config';

/**
 * Keyring specifier for the Composio API key. `service` is a reverse
 * DNS identifier shared by every composio CLI install; `user` is a
 * single fixed slot because the API key is user-scoped (one per
 * logged-in account, independent of which org/project the user is
 * currently working in).
 */
const KEYRING_SERVICE = 'com.composio.cli';
const KEYRING_USER = 'default';

// -----------------------------------------------------------------------------
// Keyring helpers — extracted from the generator so it stays within
// the max-lines-per-function lint limit. Each helper takes its deps
// as parameters rather than closing over the generator's locals.
// -----------------------------------------------------------------------------

type KeyringDeps = {
  keyring: KeyringServiceShape;
  useLegacyStorage: boolean;
};

/**
 * Write `password` into the OS keyring. Returns `true` on success,
 * `false` on `NoStorageAccess` or unexpected errors so the caller
 * can fall back to plaintext. Never propagates — the CLI always
 * prefers "keep working with plaintext fallback" over "crash".
 */
const writeKeyring = (deps: KeyringDeps, password: string) =>
  Effect.gen(function* () {
    if (deps.useLegacyStorage) return false;
    return yield* deps.keyring.setPassword(KEYRING_SERVICE, KEYRING_USER, password).pipe(
      Effect.map(() => true),
      Effect.catchAll(err =>
        Effect.gen(function* () {
          if (err instanceof KeyringError && err.kind === 'NoStorageAccess') {
            yield* Effect.logDebug(
              'OS keyring unavailable, storing api_key in user_data.json as plaintext. ' +
                `Reason: ${err.message}`
            );
          } else {
            yield* Effect.logDebug(
              'Unexpected keyring error while writing api_key, falling back to plaintext: ' +
                (err instanceof Error ? err.message : String(err))
            );
          }
          return false;
        })
      )
    );
  });

/**
 * Read the API key from the OS keyring. Returns `Option.some(value)`
 * if found, `Option.none()` on NoEntry or any failure (with warning
 * logged). The caller falls back to plaintext on `none`.
 */
const readKeyring = (deps: KeyringDeps) =>
  Effect.gen(function* () {
    if (deps.useLegacyStorage) return Option.none<string>();
    return yield* deps.keyring.getPassword(KEYRING_SERVICE, KEYRING_USER).pipe(
      Effect.map(Option.some),
      Effect.catchAll(err =>
        Effect.gen(function* () {
          if (err instanceof KeyringError && err.kind === 'NoEntry') {
            yield* Effect.logDebug('No keyring entry found for Composio API key');
          } else if (err instanceof KeyringError && err.kind === 'NoStorageAccess') {
            // Expected normal path on headless Linux / containers /
            // CI — log at debug to avoid polluting stdout on every
            // CLI invocation. Only the first write attempt would
            // warn loudly (see `writeKeyring`).
            yield* Effect.logDebug(
              'OS keyring unavailable, falling back to user_data.json. ' + `Reason: ${err.message}`
            );
          } else {
            yield* Effect.logDebug(
              'Unexpected keyring error while reading api_key, falling back to plaintext: ' +
                (err instanceof Error ? err.message : String(err))
            );
          }
          return Option.none<string>();
        })
      )
    );
  });

/**
 * Best-effort keyring delete. Swallows `NoEntry` (idempotent) and
 * `NoStorageAccess` (logout should not fail because the keyring is
 * unreachable).
 */
const deleteKeyring = (deps: KeyringDeps) =>
  Effect.gen(function* () {
    if (deps.useLegacyStorage) return;
    yield* deps.keyring.deleteCredential(KEYRING_SERVICE, KEYRING_USER).pipe(
      Effect.catchAll(err =>
        Effect.gen(function* () {
          if (
            err instanceof KeyringError &&
            (err.kind === 'NoEntry' || err.kind === 'NoStorageAccess')
          ) {
            yield* Effect.logDebug(`Keyring delete skipped: ${err.kind}`);
          } else {
            yield* Effect.logWarning(
              'Keyring delete failed: ' + (err instanceof Error ? err.message : String(err))
            );
          }
        })
      )
    );
  });

// -----------------------------------------------------------------------------
// Service definition
// -----------------------------------------------------------------------------

export class ComposioUserContext extends Context.Tag('ComposioUserData')<
  ComposioUserContext,
  {
    readonly data: UserDataWithDefaults;
    isLoggedIn: () => boolean;
    logout: Effect.Effect<void, ParseError | PlatformError, never>;
    login: (
      apiKey: string,
      orgId?: string,
      testUserId?: string
    ) => Effect.Effect<void, ParseError | PlatformError, never>;
    update: (data: UserData) => Effect.Effect<void, ParseError | PlatformError, never>;
  }
>() {}

export const rawComposioUserContextLive = Layer.effect(
  ComposioUserContext,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const apiKey = yield* APP_CONFIG['USER_API_KEY'];
    const baseURL = yield* APP_CONFIG['BASE_URL'];
    const webURL = yield* APP_CONFIG['WEB_URL'];
    const cliConfig = yield* ComposioCliUserConfig;
    const keyring = yield* KeyringService;

    // `security: "auto"` and `"json"` both keep the API key in
    // plaintext `user_data.json` (the legacy path — same behavior
    // as every prior CLI release). `"keychain-subprocess"` and
    // `"keychain"` opt into the OS credential store.
    const useLegacyStorage =
      cliConfig.data.security === 'auto' || cliConfig.data.security === 'json';
    const kDeps: KeyringDeps = { keyring, useLegacyStorage };

    const cacheDir = yield* setupCacheDir;
    const jsonUserConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);

    let userData = UserData.make({
      apiKey,
      baseURL: Option.some(baseURL),
      webURL: Option.some(webURL),
      orgId: Option.none(),
      projectId: Option.none(),
      testUserId: Option.none(),
    });

    const writeJson = (snapshot: UserData) =>
      Effect.gen(function* () {
        const onDisk: UserData = useLegacyStorage
          ? snapshot
          : { ...snapshot, apiKey: Option.none() };
        const encoded = yield* userDataToJSON(onDisk);
        const normalized = JSON.stringify(
          (() => {
            const parsed = JSON.parse(encoded) as Record<string, unknown>;
            if (parsed.project_id === null) delete parsed.project_id;
            if (!useLegacyStorage && parsed.api_key === null) delete parsed.api_key;
            return parsed;
          })()
        );
        yield* Effect.logDebug('Saving user data:', normalized);
        yield* fs.writeFileString(jsonUserConfigPath, normalized);
      });

    const logout = Effect.gen(function* () {
      yield* deleteKeyring(kDeps);
      const cleared: UserData = {
        apiKey: Option.none(),
        baseURL: Option.none(),
        webURL: Option.some(webURL),
        orgId: Option.none(),
        projectId: Option.none(),
        testUserId: Option.none(),
      };
      userData = cleared;
      yield* writeJson(cleared);
    });

    const login = (apiKey: string, orgId?: string, testUserId?: string) =>
      Effect.gen(function* () {
        const keyringOk = yield* writeKeyring(kDeps, apiKey);
        const next: UserData = {
          ...userData,
          apiKey: Option.some(apiKey),
          baseURL: Option.some(baseURL),
          webURL: Option.some(webURL),
          orgId: Option.fromNullable(orgId),
          projectId: userData.projectId,
          testUserId: Option.fromNullable(testUserId),
        };
        userData = next;

        if (keyringOk) {
          // Keyring has the key — writeJson will strip api_key from
          // disk automatically (useLegacyStorage is false).
          yield* writeJson(next);
        } else {
          // Keyring write failed (NoStorageAccess / headless Linux).
          // Force api_key into the JSON so it survives across
          // process restarts. We bypass writeJson's strip logic by
          // temporarily writing with the legacy-storage codepath.
          const onDisk = yield* userDataToJSON(next);
          const normalized = JSON.stringify(
            (() => {
              const parsed = JSON.parse(onDisk) as Record<string, unknown>;
              if (parsed.project_id === null) delete parsed.project_id;
              return parsed;
            })()
          );
          yield* Effect.logDebug('Saving user data (keyring fallback):', normalized);
          yield* fs.writeFileString(jsonUserConfigPath, normalized);
        }
      });

    const update = (data: Partial<UserData>) =>
      Effect.gen(function* () {
        const nextUserData = { ...userData, ...data } satisfies UserData;
        userData = nextUserData;
        yield* writeJson(nextUserData);
        yield* Effect.logDebug('User data updated:', userData);
      });

    const load = Effect.gen(function* () {
      yield* Effect.logDebug('Loading user data from', jsonUserConfigPath);
      const userDataJson = yield* fs.readFileString(jsonUserConfigPath, 'utf8');
      yield* Effect.logDebug('User data (raw):', userDataJson);
      const parsedUserData = (yield* userDataFromJSON(userDataJson)) satisfies UserData;
      yield* Effect.logDebug('User data (parsed):', parsedUserData);

      const overriddenUserData = {
        ...userData,
        ...parsedUserData,
        apiKey: apiKey.pipe(Option.orElse(() => parsedUserData.apiKey)),
        baseURL: Option.some(baseURL),
        webURL: Option.some(webURL),
        orgId: parsedUserData.orgId,
        projectId: parsedUserData.projectId,
        testUserId: parsedUserData.testUserId,
      } satisfies UserData;

      yield* Effect.logDebug('User data (overridden from env vars):', overriddenUserData);
      userData = overriddenUserData;
      return userData;
    });

    if (yield* fs.exists(jsonUserConfigPath)) {
      yield* Effect.logDebug('User data file exists, loading it');
      yield* load.pipe(
        Effect.catchAll(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug(
              'Failed to load user data file (empty or corrupted), resetting to defaults:',
              error
            );
            yield* writeJson(userData);
          })
        )
      );
    } else {
      yield* Effect.logDebug('User data file does not exist, creating a new one');
      yield* writeJson(userData);
    }

    // Resolve API key: env var > keyring > legacy plaintext.
    if (Option.isNone(apiKey) && !useLegacyStorage) {
      const plaintextOnDisk = userData.apiKey;
      const fromKeyring = yield* readKeyring(kDeps);

      if (Option.isSome(fromKeyring)) {
        userData = { ...userData, apiKey: fromKeyring };
        if (Option.isSome(plaintextOnDisk)) {
          yield* Effect.logDebug('Clearing stale plaintext api_key from user_data.json');
          yield* writeJson(userData);
        }
      } else if (Option.isSome(plaintextOnDisk)) {
        yield* Effect.logDebug('Migrating legacy api_key from user_data.json to the OS keyring');
        const migrated = yield* writeKeyring(kDeps, plaintextOnDisk.value);
        if (migrated) {
          yield* Effect.logInfo('Composio API key migrated from user_data.json to the OS keyring');
          yield* writeJson(userData);
        }
      }
    }

    const isLoggedIn = () => Option.isSome(userData.apiKey);

    const snapshot = (): UserDataWithDefaults => ({
      ...userData,
      baseURL: Option.getOrElse(userData.baseURL, () => baseURL),
      webURL: Option.getOrElse(userData.webURL, () => webURL),
      orgId: userData.orgId,
      projectId: userData.projectId,
      testUserId: userData.testUserId,
    });

    return ComposioUserContext.of({
      get data() {
        return snapshot();
      },
      isLoggedIn,
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
 * Only `"keychain"` opts into the FFI path. Everything else uses the
 * subprocess backend — including `"auto"` and `"json"`, which never
 * actually call the keyring (useLegacyStorage gates them off), but
 * we still build a usable subprocess store so the layer wiring stays
 * uniform.
 */
const resolveMacOSBackend = (
  security: 'auto' | 'json' | 'keychain-subprocess' | 'keychain'
): MacOSBackend => (security === 'keychain' ? 'ffi' : 'auto');

/**
 * Public layer that pre-provides the keyring and CLI-config deps,
 * leaving only `FileSystem` as the external requirement. The keyring
 * backend is chosen dynamically from the user's `config.json`
 * `security` field — `"auto"` / `"keychain-subprocess"` select the
 * subprocess path (default); `"keychain"` opts into the experimental
 * FFI path (requires Developer ID-signed binary to avoid dialogs).
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
