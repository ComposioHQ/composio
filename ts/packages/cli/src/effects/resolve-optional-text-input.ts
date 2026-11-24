import { Effect, FileSystem, Option, Path } from 'effect';

import { commandInputError } from 'src/commands/errors';
import { APP_CONFIG } from 'src/config';
import { RUN_STAGED_ARGUMENTS_FILE } from 'src/constants';
import { readStdin } from 'src/effects/read-stdin';
import { localFileScope, resolveScopedLocalFile } from 'src/services/tool-file-uploads';

/**
 * Resolves a literal, a guarded local file (`@path`), or stdin (`-` or `@-`).
 * An absent flag leaves stdin untouched.
 */
export const resolveExplicitTextInput = (
  input: Option.Option<string>,
  options: {
    readonly command: string;
    readonly flag: string;
    readonly allowRunStagedArguments?: true;
  }
) =>
  Effect.gen(function* () {
    if (Option.isNone(input)) {
      return undefined;
    }
    const value = input.value.trim();
    if (value === '-' || value === '@-') {
      return yield* readStdin;
    }
    if (!value.startsWith('@')) {
      return value;
    }

    const invalidInput = commandInputError(options.command);
    const filePath = value.slice(1).trim();
    if (!filePath) {
      return yield* invalidInput('Expected a file path after "@".', options.flag);
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = options.allowRunStagedArguments
      ? yield* Effect.orDie(APP_CONFIG.RUN_STAGED_FILES_FILE)
      : undefined;
    const scope = yield* localFileScope(path, manifestPath);
    return yield* resolveScopedLocalFile({
      fs,
      path,
      filePath,
      scope,
      operation: 'read',
      allowStaging:
        scope.stagingDirectory !== undefined &&
        filePath === path.join(scope.stagingDirectory, RUN_STAGED_ARGUMENTS_FILE),
    }).pipe(
      Effect.flatMap(canonicalPath => fs.readFileString(canonicalPath, 'utf-8')),
      Effect.mapError(error => invalidInput(error.message, options.flag))
    );
  });
