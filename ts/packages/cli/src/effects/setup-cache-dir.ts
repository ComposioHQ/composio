import { Effect } from 'effect';
import { FileSystem, Path } from '@effect/platform';
import * as constants from 'src/constants';
import { APP_CONFIG } from 'src/effects/app-config';
import { NodeOs } from 'src/services/node-os';

// Helper to create cache directory
export const setupCacheDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const os = yield* NodeOs;

  const cacheDir =
    (yield* APP_CONFIG.CACHE_DIR) ?? path.join(os.homedir, constants.USER_COMPOSIO_DIR);

  // Ensure cache directory exists
  yield* fs.makeDirectory(cacheDir, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));

  return cacheDir;
});
