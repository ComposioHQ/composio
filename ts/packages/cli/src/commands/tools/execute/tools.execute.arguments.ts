import { Duration, Effect, FileSystem, Option, Path, Result } from 'effect';
import { APP_CONFIG } from 'src/config';
import { RUN_STAGED_ARGUMENTS_FILE } from 'src/constants';
import { resolveExplicitTextInput } from 'src/effects/resolve-optional-text-input';
import { Stdin } from 'src/services/stdin';
import {
  executeLocalFileScope,
  findFileUploadablePaths,
  resolveExecuteLocalFile,
  schemaHasFileUploadable,
  setArgumentAt,
} from 'src/services/tool-file-uploads';
import { isPlainRecord, parseJsonRecord } from 'src/utils/parse-json';
import { invalidArguments, ToolExecutionError } from './tools.execute.errors';

/**
 * How long `composio execute` waits for piped JSON to start arriving when it got no `-d`. An
 * agent harness can hand the CLI a pipe it never writes to or closes; waiting for its end would
 * hang the command with no output.
 */
export const PIPED_STDIN_SILENCE_TIMEOUT = Duration.seconds(1);

const readArgumentsFile = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = yield* Effect.orDie(APP_CONFIG.RUN_STAGED_FILES_FILE);
    const scope = yield* executeLocalFileScope(path, manifestPath);
    const canonicalPath = yield* resolveExecuteLocalFile({
      fs,
      path,
      filePath,
      scope,
      operation: 'read',
      allowStaging:
        scope.stagingDirectory !== undefined &&
        filePath === path.join(scope.stagingDirectory, RUN_STAGED_ARGUMENTS_FILE),
    });
    return yield* fs.readFileString(canonicalPath, 'utf-8');
  }).pipe(Effect.mapError(error => invalidArguments(error.message, '--data')));

/**
 * The tool arguments: `-d` as `resolveExplicitTextInput` reads it, else JSON piped on stdin, else
 * `{}` when stdin is a terminal (e.g. tools with no required args).
 */
export const resolveInput = (input: Option.Option<string>) =>
  Effect.gen(function* () {
    if (Option.isSome(input)) {
      return (yield* resolveExplicitTextInput(input, readArgumentsFile)) ?? '{}';
    }
    const stdin = yield* Stdin;
    if (stdin.isTTY()) {
      return '{}';
    }
    const piped = yield* stdin.readAllUnlessSilent(PIPED_STDIN_SILENCE_TIMEOUT);
    if (Option.isNone(piped)) {
      // Running the tool with `{}` could act without the arguments still on their way.
      return yield* Effect.fail(
        invalidArguments(
          "No input arrived on stdin within 1 second. Pass the arguments with -d '{...}', or -d - to wait for stdin.",
          '--data'
        )
      );
    }
    return piped.value;
  });

export const parseArguments = (raw: string) =>
  Effect.fromResult(
    parseJsonRecord(raw).pipe(
      Result.mapError(error =>
        invalidArguments(
          error.reason === 'not-a-record'
            ? 'Expected a JSON object for tool arguments, e.g. -d \'{ "key": "value" }\''
            : 'Invalid JSON input. Provide JSON or a JS-style object literal, e.g. -d \'{ "key": "value" }\''
        )
      )
    )
  );

const hasNestedKey = (
  record: Record<string, unknown>,
  pathParts: ReadonlyArray<string | number>
): boolean => {
  let current: unknown = record;
  for (const key of pathParts) {
    if (Array.isArray(current) && typeof key === 'number' && key < current.length) {
      current = current[key];
    } else if (isPlainRecord(current) && typeof key === 'string' && Object.hasOwn(current, key)) {
      current = current[key];
    } else return false;
  }
  return true;
};

export const injectSingleFileArgument = (params: {
  readonly slug: string;
  readonly args: Record<string, unknown>;
  readonly filePath: string;
  readonly schema: Record<string, unknown>;
}) =>
  Effect.gen(function* () {
    const uploadablePaths = findFileUploadablePaths(params.schema, [], params.args);

    if (uploadablePaths.length === 0) {
      return yield* new ToolExecutionError({
        reason: 'file_input',
        toolSlug: params.slug,
        message: schemaHasFileUploadable(params.schema)
          ? `Tool "${params.slug}" has no matching file_uploadable input in the supplied arguments. Supply the target array item with -d, or remove --file.`
          : `Tool "${params.slug}" has no file_uploadable input. Remove --file or pass JSON via -d.`,
      });
    }

    if (uploadablePaths.length > 1) {
      return yield* new ToolExecutionError({
        reason: 'file_input',
        toolSlug: params.slug,
        message: `Tool "${params.slug}" has multiple file_uploadable inputs (${uploadablePaths.map(parts => parts.join('.')).join(', ')}). Pass the target field explicitly with -d instead of --file.`,
      });
    }

    const targetPath = uploadablePaths[0] ?? [];
    if (hasNestedKey(params.args, targetPath)) {
      return yield* new ToolExecutionError({
        reason: 'file_input',
        toolSlug: params.slug,
        message: `Cannot use --file because "${targetPath.join('.')}" is already set in -d. Remove that field or omit --file.`,
      });
    }

    return setArgumentAt(params.args, targetPath, params.filePath);
  });
