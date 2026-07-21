import { ConfigProvider, Effect, FileSystem, PlatformError } from 'effect';
import { JSONParse, JSONParseError } from 'src/effects/json';

/**
 * Lazy version of an `effect/ConfigProvider` that reads config values from a
 * JSON file. The file is not read until the returned provider is first
 * consulted for a config value, and the parsed provider is cached for
 * subsequent lookups within the same process.
 *
 * A missing file is treated as "no config here" (every path lookup resolves
 * to `undefined`, matching `ConfigProvider`'s not-found contract) rather than
 * a hard failure — callers can still fall back to other providers or
 * `Config.withDefault`. Any other read/parse failure surfaces as a
 * `ConfigProvider.SourceError`.
 */
export const configProviderFromLazyJson = (
  filePath: string
): Effect.Effect<ConfigProvider.ConfigProvider, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const isNotFound = (error: PlatformError.PlatformError): boolean =>
      error.reason._tag === 'NotFound';

    // Memoize the built provider so the file is read (and parsed) at most
    // once per process, no matter how many config paths are looked up.
    let cached: ConfigProvider.ConfigProvider | undefined;

    const loadRootProvider: Effect.Effect<
      ConfigProvider.ConfigProvider | undefined,
      ConfigProvider.SourceError
    > = Effect.gen(function* () {
      if (cached) {
        return cached;
      }

      const content = yield* fs.readFileString(filePath, 'utf-8').pipe(
        Effect.map((text): string | undefined => text),
        Effect.catchIf(isNotFound, () => Effect.succeed(undefined)),
        Effect.mapError(
          error =>
            new ConfigProvider.SourceError({
              message: error.message,
              cause: error,
            })
        )
      );

      if (content === undefined) {
        return undefined;
      }

      const json = yield* JSONParse(content).pipe(
        Effect.mapError(
          (error: JSONParseError) =>
            new ConfigProvider.SourceError({ message: error.message, cause: error })
        )
      );

      cached = ConfigProvider.fromUnknown(json);
      return cached;
    });

    return ConfigProvider.make(path =>
      Effect.flatMap(loadRootProvider, provider =>
        provider ? provider.load(path) : Effect.succeed(undefined)
      )
    );
  });
