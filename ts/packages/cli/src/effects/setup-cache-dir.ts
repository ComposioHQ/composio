import path from 'node:path';
import os from 'node:os';
import { Effect, pipe, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import * as constants from 'src/constants';
import { APP_CONFIG } from 'src/effects/app-config';

// Helper to create cache directory
export const setupCacheDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;

  const cacheDir = yield* pipe(
    APP_CONFIG.CACHE_DIR,
    Effect.map(Option.getOrElse(() => path.join(os.homedir(), constants.USER_COMPOSIO_DIR)))
  );

  yield* fs.makeDirectory(cacheDir, { recursive: true });

  return cacheDir;
});
