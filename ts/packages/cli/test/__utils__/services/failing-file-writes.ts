import { Effect, FileSystem, Layer, PlatformError } from 'effect';

/**
 * Wraps the provided `FileSystem` so `writeFileString` fails with `PermissionDenied` for every
 * path `failsFor` matches; other paths and operations reach the real file system.
 */
export const failingFileWrites = (failsFor: (path: string) => boolean) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, fs =>
      FileSystem.FileSystem.of({
        ...fs,
        writeFileString: (path, data, options) =>
          failsFor(path)
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: 'PermissionDenied',
                  module: 'FileSystem',
                  method: 'writeFileString',
                  pathOrDescriptor: path,
                })
              )
            : fs.writeFileString(path, data, options),
      })
    )
  );
