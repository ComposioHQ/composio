import { FileSystem } from '@effect/platform';
import { Effect, Context, Layer, Option } from 'effect';
import path from 'path';
import { UserData, userDataFromJSON, userDataToJSON } from 'src/models/user-data';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import * as constants from 'src/constants';
import type { PlatformError } from '@effect/platform/Error';
import type { ParseError } from 'effect/ParseResult';
import { APP_CONFIG } from 'src/effects/app-config';

export class ComposioUserContext extends Context.Tag('ComposioUserData')<
  ComposioUserContext,
  {
    readonly data: UserData;

    /**
     * Returns `true` if the user is logged in, i.e., has a valid Composio API key.
     */
    isLoggedIn: () => boolean;

    /**
     * Logs out the user by clearing the API key and any other sensitive data.
     */
    logout: Effect.Effect<void, ParseError | PlatformError, never>;

    /**
     * Logs in the user by setting the API key.
     */
    login: (apiKey: string) => Effect.Effect<void, ParseError | PlatformError, never>;

    /**
     * Saves the user data to a persistent store, e.g., file or database.
     */
    update: (data: UserData) => Effect.Effect<void, ParseError | PlatformError, never>;
  }
>() {}

export const ComposioUserContextLive = Layer.effect(
  ComposioUserContext,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const apiKey = yield* APP_CONFIG['API_KEY'];
    const baseURL = yield* APP_CONFIG['BASE_URL']; // Some('/'), idk why

    /**
     * Ensure the cache directory exists before reading/writing user data.
     */
    const cacheDir = yield* setupCacheDir;
    const jsonUserConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);

    let userData = UserData.make({
      apiKey,
      baseURL,
    });

    const logout = Effect.gen(function* () {
      yield* update({ apiKey: Option.none() });
    });

    const login = (apiKey: string) =>
      Effect.gen(function* () {
        yield* update({ apiKey: Option.some(apiKey) });
      });

    /**
     * Saves the user data to a JSON file.
     */
    const update = (data: Partial<UserData>) =>
      Effect.gen(function* () {
        const userDataAsJson = yield* userDataToJSON({ ...userData, ...data });
        yield* Effect.logDebug('Saving user data:', userDataAsJson);
        yield* fs.writeFileString(jsonUserConfigPath, userDataAsJson);
        userData = { ...userData, ...data } satisfies UserData;
        yield* Effect.logDebug('User data updated:', userData);
      });

    /**
     * Loads the user data from a JSON file.
     */
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
        baseURL: baseURL.pipe(Option.orElse(() => parsedUserData.baseURL)),
      } satisfies UserData;

      yield* Effect.logDebug('User data (overridden from env vars):', overriddenUserData);

      userData = overriddenUserData;
      return userData;
    });

    if (yield* fs.exists(jsonUserConfigPath)) {
      yield* Effect.logDebug('User data file exists, loading it');
      yield* load;
    } else {
      yield* Effect.logDebug('User data file does not exist, creating a new one');
      yield* update(userData);
    }

    const isLoggedIn = () => Option.isSome(userData.apiKey);

    return ComposioUserContext.of({
      data: userData,
      isLoggedIn,
      update,
      login,
      logout,
    });
  })
);
