import { BunFileSystem, BunContext } from '@effect/platform-bun';
import { Command, FileSystem } from '@effect/platform';
import { Effect, Logger, LogLevel } from 'effect';
import path from 'node:path';

const __dirname = path.resolve(path.dirname(new URL(import.meta.url).pathname));

/**
 * Sets up TypeScript fixtures by simulating @composio/core package installation.
 * For all fixture folders containing package.json with @composio/core in dependencies or devDependencies,
 * installs the package by copying the built files from dist to node_modules.
 */
function setupFixturesTypeScript() {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Path to the fixtures directory.
    // Note: we're using `__dirname` because `import.meta.resolve` is not yet available in Vitest.
    // See: https://github.com/vitest-dev/vitest/pull/5188.
    const fixturesDir = path.resolve(__dirname, '../__fixtures__');
    yield* Effect.logDebug(`Setting up TypeScript fixtures in ${fixturesDir}`);

    // Get all fixture directories
    const fixtureEntries = yield* fs.readDirectory(fixturesDir);

    // Filter to only directories by checking each entry
    const fixtureDirNames = yield* Effect.all(
      fixtureEntries.map(entryName =>
        Effect.gen(function* () {
          const entryPath = path.join(fixturesDir, entryName);
          const stat = yield* fs.stat(entryPath);
          return stat.type === 'Directory' ? entryName : null;
        }).pipe(Effect.catchAll(() => Effect.succeed(null)))
      )
    ).pipe(Effect.map(results => results.filter((name): name is string => name !== null)));

    yield* Effect.all(
      fixtureDirNames.map(fixtureDirName =>
        Effect.gen(function* () {
          const fixturePath = path.join(fixturesDir, fixtureDirName);

          // Check if package.json exists and contains @composio/core
          const packageJsonPath = path.join(fixturePath, 'package.json');
          const packageJsonExists = yield* fs.exists(packageJsonPath);

          if (!packageJsonExists) {
            yield* Effect.logDebug(`Skipping ${fixtureDirName}: no package.json found`);
            return;
          }

          // Read and parse package.json
          const packageJsonContent = yield* fs.readFileString(packageJsonPath);
          const packageJson = JSON.parse(packageJsonContent);

          // Check if @composio/core is in dependencies or devDependencies
          const hasComposioCore =
            (packageJson.dependencies && packageJson.dependencies['@composio/core']) ||
            (packageJson.devDependencies && packageJson.devDependencies['@composio/core']);

          if (!hasComposioCore) {
            yield* Effect.logDebug(
              `Skipping ${fixtureDirName}: no @composio/core dependency found`
            );
            return;
          }

          yield* Effect.logDebug(`Setting up @composio/core for fixture: ${fixtureDirName}`);

          // Clean up existing node_modules/@composio/core
          const nodeModulesDir = path.join(fixturePath, 'node_modules');
          yield* fs.remove(nodeModulesDir, { recursive: true });

          const installCmd = Command.make('pnpm', 'install', '--ignore-workspace');
          const exitCode = yield* installCmd.pipe(
            Command.workingDirectory(fixturePath),
            Command.stdout('inherit'),
            Command.stderr('inherit'),
            Command.exitCode
          );

          if (exitCode !== 0) {
            yield* Effect.logError(
              `Failed to install @composio/core for fixture: ${fixtureDirName}`
            );
            return;
          }

          yield* Effect.logDebug(
            `Successfully set up @composio/core for fixture: ${fixtureDirName}`
          );
        }).pipe(
          Effect.catchAll(error =>
            Effect.logError(`Failed to setup fixture ${fixtureDirName}: ${error}`)
          )
        )
      ),
      { concurrency: 4 }
    );
  });
}

export async function setup() {
  const program = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* setupFixturesTypeScript();
  }).pipe(
    Effect.provide(BunFileSystem.layer),
    Effect.provide(BunContext.layer),
    Effect.provide(Logger.minimumLogLevel(LogLevel.Debug))
  );

  await Effect.runPromise(program);
}
