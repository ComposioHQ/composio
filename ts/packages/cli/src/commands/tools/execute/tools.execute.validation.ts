import { Effect } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { rejectLocalFilesWithoutUpload } from 'src/services/tool-file-uploads';
import {
  ToolInputValidationError,
  validateToolInputArguments,
  validateToolInputArgumentsWithDefinition,
} from 'src/services/tool-input-validation';
import { perfDebugLog } from './tools.execute.debug';

// What a dry run checks against the schema: the arguments, then any local file
// the tool cannot upload, which the real call refuses before sending.
export const validateDryRunArguments = (
  slug: string,
  args: Record<string, unknown>,
  definition: { readonly schemaPath: string; readonly schema: Record<string, unknown> }
) =>
  Effect.gen(function* () {
    yield* validateToolInputArgumentsWithDefinition(slug, args, definition);
    yield* rejectLocalFilesWithoutUpload({
      fs: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      toolSlug: slug,
      arguments_: args,
      inputSchema: definition.schema,
    });
  });

// Gates the tool call: the request is only sent once the arguments pass. A
// schema that cannot be loaded does not block the call, the server validates too.
export const validateToolInputBeforeExecute = (params: {
  readonly slug: string;
  readonly args: Record<string, unknown>;
  readonly resolvedProject: {
    readonly orgId: string;
    readonly projectId: string;
  };
}) =>
  validateToolInputArguments(params.slug, params.args, {
    orgId: params.resolvedProject.orgId,
    projectId: params.resolvedProject.projectId,
  }).pipe(
    Effect.asVoid,
    Effect.catchIf(
      error => !(error instanceof ToolInputValidationError),
      () => perfDebugLog('execute.validation.schema_unavailable', { slug: params.slug })
    )
  );
