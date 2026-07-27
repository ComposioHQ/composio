import { FileSystem } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { Effect } from 'effect';
import { afterEach, beforeEach, vi } from 'vitest';

// Point every test at a fresh, empty config directory so nothing reads or
// writes the developer's real `~/.composio`. An empty directory holds no
// permission snapshot, so the tool-permission gate resolves to 'skip' instead
// of spawning the native approval dialog / browser prompt from the developer's
// real enhanced-controls state. Tests that need a specific directory stub
// COMPOSIO_CACHE_DIR themselves; stubs applied inside a test win over this one.
let testConfigDirectory: string | undefined;

const runFs = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunFileSystem.layer)));

beforeEach(async () => {
  testConfigDirectory = await runFs(
    Effect.flatMap(FileSystem.FileSystem, fs =>
      fs.makeTempDirectory({ prefix: 'composio-cli-test-config-' })
    )
  );
  vi.stubEnv('COMPOSIO_CACHE_DIR', testConfigDirectory);
});

afterEach(async () => {
  const directory = testConfigDirectory;
  testConfigDirectory = undefined;
  if (directory) {
    await runFs(
      Effect.flatMap(FileSystem.FileSystem, fs =>
        fs.remove(directory, { recursive: true, force: true })
      )
    );
  }
});
