import { FileSystem, Error as PlatformError } from '@effect/platform';
import {
  pipe,
  Array,
  Option,
  Effect,
  Cause,
  RegExp as regexp,
  Config,
  ConfigError,
  ConfigProvider,
  ConfigProviderPathPatch,
  HashSet,
} from 'effect';
import { JSONParse, JSONParseError } from 'src/effects/json';

/**
 * Lazy version of a `effect/ConfigProvider` that reads config values from a JSON file.
 */
export const configProviderFromLazyJson = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const { pathDelim, seqDelim } = { seqDelim: ',', pathDelim: '.' };
    const makePathString = (path: ReadonlyArray<string>): string =>
      pipe(path, Array.join(pathDelim));
    const unmakePathString = (pathString: string): ReadonlyArray<string> =>
      pathString.split(pathDelim);

    const STR_INDEX_REGEX = /(^.+)(\[(\d+)\])$/;

    const parseInteger = (str: string): Option.Option<number> => {
      const parsedIndex = Number.parseInt(str);
      return Number.isNaN(parsedIndex) ? Option.none() : Option.some(parsedIndex);
    };

    const splitIndexFrom = (key: string): Option.Option<[string, number]> => {
      const match = key.match(STR_INDEX_REGEX);
      if (match !== null) {
        const matchedString = match[1];
        const matchedIndex = match[3];
        const optionalString =
          matchedString !== undefined && matchedString.length > 0
            ? Option.some(matchedString)
            : Option.none();
        const optionalIndex = pipe(
          matchedIndex !== undefined && matchedIndex.length > 0
            ? Option.some(matchedIndex)
            : Option.none(),
          Option.flatMap(parseInteger)
        );
        return Option.all([optionalString, optionalIndex]);
      }
      return Option.none();
    };

    const splitIndexInKeys = (
      map: Map<string, string>,
      unmakePathString: (str: string) => ReadonlyArray<string>,
      makePathString: (chunk: ReadonlyArray<string>) => string
    ): Map<string, string> => {
      const newMap: Map<string, string> = new Map();
      for (const [pathString, value] of map) {
        const keyWithIndex = pipe(
          unmakePathString(pathString),
          Array.flatMap(key =>
            Option.match(splitIndexFrom(key), {
              onNone: () => Array.of(key),
              onSome: ([key, index]) => Array.make(key, `[${index}]`),
            })
          )
        );
        newMap.set(makePathString(keyWithIndex), value);
      }
      return newMap;
    };

    const parseConfig =
      <A>(_config: Config.Config<A>) =>
      (configContent: string) =>
        Effect.gen(function* () {
          const configContentAsJSON = yield* Effect.catchIf(
            JSONParse(configContent),
            (e): e is JSONParseError => e instanceof JSONParseError,
            e => Effect.fail(ConfigError.SourceUnavailable([], e.message, Cause.fail(e)))
          );

          const map = new Map(
            Object.entries(configContentAsJSON).map(([key, value]) => [key, String(value)] as const)
          );

          const mapWithIndexSplit = splitIndexInKeys(
            map,
            str => unmakePathString(str),
            makePathString
          );

          return mapWithIndexSplit;
        });

    const readConfig = <A>(filePath: string, config: Config.Config<A>) =>
      Effect.flatMap(fs.readFileString(filePath, 'utf-8'), parseConfig(config));

    const sourceError = (error: PlatformError.PlatformError) =>
      ConfigError.SourceUnavailable([], error.description ?? error.message, Cause.fail(error));

    const pathNotFoundError = ConfigError.MissingData([], `Path ${filePath} not found`);
    const handlePlatformError = (error: PlatformError.PlatformError) =>
      error._tag === 'SystemError' && error.reason === 'NotFound'
        ? Effect.fail(pathNotFoundError)
        : Effect.fail(sourceError(error));

    const splitPathString = (text: string, delim: string): Array<string> => {
      const split = text.split(new RegExp(`\\s*${regexp.escape(delim)}\\s*`));
      return split;
    };

    const parsePrimitive = <A>(
      text: string,
      path: ReadonlyArray<string>,
      primitive: Config.Config.Primitive<A>,
      delimiter: string,
      split: boolean
    ): Effect.Effect<Array<A>, ConfigError.ConfigError> => {
      if (!split) {
        return pipe(
          primitive.parse(text),
          Effect.mapBoth({
            onFailure: ConfigError.prefixed(Array.fromIterable(path)),
            onSuccess: Array.of,
          })
        );
      }
      return pipe(
        splitPathString(text, delimiter),
        Effect.forEach(char => primitive.parse(char.trim())),
        Effect.mapError(ConfigError.prefixed(Array.fromIterable(path)))
      );
    };

    const load = <A>(
      path: ReadonlyArray<string>,
      primitive: Config.Config.Primitive<A>,
      split = true
    ): Effect.Effect<Array<A>, ConfigError.ConfigError> =>
      Effect.gen(function* () {
        const mapWithIndexSplit = yield* Effect.catchIf(
          readConfig(filePath, primitive),
          PlatformError.isPlatformError,
          handlePlatformError
        );

        const pathString = makePathString(path);
        const valueOpt = mapWithIndexSplit.has(pathString)
          ? Option.some(mapWithIndexSplit.get(pathString)!)
          : Option.none();
        const value = yield* pipe(
          valueOpt,
          Effect.mapError(() =>
            ConfigError.MissingData(
              Array.fromIterable(path),
              `Expected ${pathString} to exist in the provided map`
            )
          )
        );

        return yield* parsePrimitive(value, path, primitive, seqDelim, split);
      });

    const enumerateChildren = (
      path: ReadonlyArray<string>
    ): Effect.Effect<HashSet.HashSet<string>, ConfigError.ConfigError> =>
      Effect.gen(function* () {
        const mapWithIndexSplit = yield* Effect.catchIf(
          readConfig(filePath, Config.string()),
          PlatformError.isPlatformError,
          handlePlatformError
        );

        const keyPaths = Array.fromIterable(mapWithIndexSplit.keys()).map(unmakePathString);
        const filteredKeyPaths = keyPaths
          .filter(keyPath => {
            for (let i = 0; i < path.length; i++) {
              const pathComponent = pipe(path, Array.unsafeGet(i));
              const currentElement = keyPath[i];
              if (currentElement === undefined || pathComponent !== currentElement) {
                return false;
              }
            }
            return true;
          })
          .flatMap(keyPath => keyPath.slice(path.length, path.length + 1));
        return HashSet.fromIterable(filteredKeyPaths);
      });

    return ConfigProvider.fromFlat(
      ConfigProvider.makeFlat({
        load,
        enumerateChildren,
        patch: ConfigProviderPathPatch.empty,
      })
    );
  });
