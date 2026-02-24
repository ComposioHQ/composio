import path from 'node:path';
import { Data, Effect } from 'effect';
import { FileSystem } from '@effect/platform';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import * as constants from 'src/constants';
import { type ProjectKeys, projectKeysFromJSON, projectKeysToJSON } from 'src/models/project-keys';
import type { PlatformError } from '@effect/platform/Error';
import type { ParseError } from 'effect/ParseResult';

/**
 * Pattern for validating projectId before using as filename.
 * Prevents path traversal attacks from malicious server responses.
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Error thrown when a projectId is invalid for use as a registry filename.
 */
export class InvalidProjectIdError extends Data.TaggedError('services/InvalidProjectIdError')<{
  readonly projectId: string;
}> {
  get message() {
    const sanitized = this.projectId.slice(0, 64).replace(/[^\x20-\x7E]/g, '?');
    return `Invalid projectId for registry filename: "${sanitized}". Must match /^[a-zA-Z0-9_-]+$/.`;
  }
}

/**
 * Service that manages the global `~/.composio/_keys/` registry.
 * Stores all known org+project pairs from past logins as individual JSON files.
 * Does NOT determine which project is "active" -- that is handled by `ProjectContext`.
 *
 * Requires `BunFileSystem.layer` and `NodeOs.Default` to be provided in the layer stack.
 */
export class ProjectKeyRegistry extends Effect.Service<ProjectKeyRegistry>()(
  'services/ProjectKeyRegistry',
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cacheDir = yield* setupCacheDir;
      const keysDir = path.join(cacheDir, constants.KEYS_DIR_NAME);

      const validateProjectId = (
        projectId: string
      ): Effect.Effect<string, InvalidProjectIdError> =>
        SAFE_ID_PATTERN.test(projectId)
          ? Effect.succeed(path.basename(projectId))
          : Effect.fail(new InvalidProjectIdError({ projectId }));

      return {
        /**
         * Saves an org+project pair to the global registry.
         * File is named by projectId for uniqueness.
         */
        register: (
          keys: ProjectKeys
        ): Effect.Effect<void, InvalidProjectIdError | PlatformError | ParseError> =>
          Effect.gen(function* () {
            const safeId = yield* validateProjectId(keys.projectId);

            yield* fs
              .makeDirectory(keysDir, { recursive: true })
              .pipe(Effect.catchAll(() => Effect.void));

            const filePath = path.join(keysDir, `${safeId}.json`);
            const json = yield* projectKeysToJSON(keys);
            yield* fs.writeFileString(filePath, json);

            // Set restrictive file permissions (owner read/write only)
            yield* fs
              .chmod(filePath, 0o600)
              .pipe(
                Effect.catchAll(() =>
                  Effect.logDebug(`Warning: could not set restrictive permissions on ${filePath}`)
                )
              );
          }),

        /**
         * Lists all registered org+project pairs.
         */
        listAll: (): Effect.Effect<ReadonlyArray<ProjectKeys>, PlatformError | ParseError> =>
          Effect.gen(function* () {
            const exists = yield* fs.exists(keysDir);
            if (!exists) return [] as ReadonlyArray<ProjectKeys>;

            const entries = yield* fs.readDirectory(keysDir);
            const jsonFiles = entries.filter(f => f.endsWith('.json'));

            return yield* Effect.all(
              jsonFiles.map(f =>
                fs.readFileString(path.join(keysDir, f)).pipe(Effect.flatMap(projectKeysFromJSON))
              )
            );
          }),

        /**
         * Removes ALL registry entries. No-op when _keys/ doesn't exist.
         */
        removeAll: (): Effect.Effect<void, PlatformError> =>
          Effect.gen(function* () {
            const exists = yield* fs.exists(keysDir);
            if (!exists) return;

            const entries = yield* fs.readDirectory(keysDir);
            yield* Effect.all(
              entries
                .filter(f => f.endsWith('.json'))
                .map(f => fs.remove(path.join(keysDir, f)).pipe(Effect.catchAll(() => Effect.void)))
            );
          }),
      };
    }),
    dependencies: [],
  }
) {}
