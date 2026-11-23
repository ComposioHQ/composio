import { Effect } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { rejectLocalFilesWithoutUpload } from 'src/services/tool-file-uploads';
import {
  getOrFetchToolInputDefinition,
  validateToolInputArgumentsWithDefinition,
} from 'src/services/tool-input-validation';
import { isMetaToolSlug } from 'src/utils/meta-tool-slugs';

// What a dry run checks, matching the real call: the arguments against the
// schema unless checks are skipped, then any local file the tool cannot upload.
// The real call refuses that file whatever the skip flags say, loading the
// schema for it and going on without one, and never for a meta tool, which
// uploads nothing. Returns the schema only when the arguments were checked.
export const checkDryRunArguments = (params: {
  readonly slug: string;
  readonly args: Record<string, unknown>;
  readonly projectScope: { readonly orgId?: string; readonly projectId?: string };
  readonly verificationDisabled: boolean;
}) =>
  Effect.gen(function* () {
    const { slug, args, verificationDisabled } = params;
    if (verificationDisabled && isMetaToolSlug(slug)) return null;

    const definition = verificationDisabled
      ? yield* getOrFetchToolInputDefinition(slug, params.projectScope).pipe(
          Effect.catch(() => Effect.succeed(null))
        )
      : yield* getOrFetchToolInputDefinition(slug, params.projectScope);
    if (!definition) return null;

    if (!verificationDisabled) {
      yield* validateToolInputArgumentsWithDefinition(slug, args, definition);
    }
    if (!isMetaToolSlug(slug)) {
      yield* rejectLocalFilesWithoutUpload({
        fs: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        toolSlug: slug,
        arguments_: args,
        inputSchema: definition.schema,
      });
    }
    return verificationDisabled ? null : definition;
  });
