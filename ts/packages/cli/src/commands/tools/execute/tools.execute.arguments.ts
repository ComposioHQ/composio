import { Effect, Option, Result } from 'effect';
import { resolveOptionalTextInput } from 'src/effects/resolve-optional-text-input';
import {
  findFileUploadablePaths,
  schemaHasFileUploadable,
  setArgumentAt,
} from 'src/services/tool-file-uploads';
import { isPlainRecord, parseJsonRecord } from 'src/utils/parse-json';
import { invalidArguments, ToolExecutionError } from './tools.execute.errors';

export const resolveInput = (input: Option.Option<string>) =>
  resolveOptionalTextInput(input, {
    // Default to empty object when no data provided (e.g. tools with no required args)
    missingValue: '{}',
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
