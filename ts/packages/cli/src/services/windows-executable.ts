import { Config, Effect, FileSystem, Option, Path } from 'effect';

/** How Windows runs a command found on `PATH`. */
export interface WindowsExecutable {
  readonly path: string;
  /** `.cmd` and `.bat` files, such as npm's command shims, only run through `cmd.exe`. */
  readonly needsShell: boolean;
}

// Windows looks up the extension-less name `claude` as `claude.exe`, `claude.cmd`, and so on.
const EXECUTABLE_EXTENSIONS = ['.exe', '.cmd', '.bat'] as const;

// The variable is spelled `Path` on Windows, and environment snapshots keep that spelling.
const WINDOWS_PATH = Config.all([
  Config.option(Config.String('Path')),
  Config.option(Config.String('PATH')),
]).pipe(Config.map(([path, upperCasePath]) => Option.orElse(path, () => upperCasePath)));

/**
 * Finds `name` the way `cmd.exe` would: in each `PATH` directory, with each executable
 * extension. Process spawning does not do this itself, and refuses to run a `.cmd` file directly.
 */
export const resolveWindowsExecutable = (
  name: string
): Effect.Effect<Option.Option<WindowsExecutable>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pathEnv = Option.getOrElse(yield* Effect.orDie(WINDOWS_PATH), () => '');
    const candidates = pathEnv
      .split(';')
      .filter(directory => directory.length > 0)
      .flatMap(directory =>
        EXECUTABLE_EXTENSIONS.map(extension => ({
          path: path.join(directory, `${name}${extension}`),
          needsShell: extension !== '.exe',
        }))
      );
    return yield* Effect.findFirst(candidates, candidate =>
      fs.exists(candidate.path).pipe(Effect.orElseSucceed(() => false))
    );
  });
