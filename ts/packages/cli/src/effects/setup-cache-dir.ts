import path from 'node:path';
import { Effect, pipe, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import * as constants from 'src/constants';
import { APP_CONFIG } from 'src/effects/app-config';
import { NodeOs } from 'src/services/node-os';

// Helper to create cache directory
export const setupCacheDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const os = yield* NodeOs;

  const cacheDir = yield* pipe(
    APP_CONFIG.CACHE_DIR,
    Effect.map(Option.getOrElse(() => path.join(os.homedir, constants.USER_COMPOSIO_DIR)))
  );

  // Ensure cache directory exists
  yield* fs.makeDirectory(cacheDir, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));

  return cacheDir;
});
