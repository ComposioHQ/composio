import { BunFileSystem, BunContext } from '@effect/platform-bun';
import { Command, FileSystem } from '@effect/platform';
import { Effect, Option, Logger, LogLevel } from 'effect';
import path from 'node:path';

const __dirname = path.resolve(path.dirname(new URL(import.meta.url).pathname));

/**
 * Sets up TypeScript fixtures by simulating `@composio/core` package installation via `pnpm`.
 * For all fixture folders containing a `package.json` with `@composio/core` in `dependencies` / `devDependencies`,
 * installs the package by copying the built files from dist to node_modules.
 */
function setupFixturesTypeScript(fixturePaths: string[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.all(
      fixturePaths.map(fixturePath => {
        const fixtureDirName = path.basename(fixturePath);
        return Effect.gen(function* () {
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
          yield* fs.remove(nodeModulesDir, { recursive: true, force: true });

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
        );
      }),
      { concurrency: 4 }
    );
  });
}

/**
 * Sets up Python fixtures by simulating `composio_core` package installation via `uv pip`.
 * For all fixture folders containing a `requirements.txt` it sets up `uv venv` and installs
 * the required packages from the Internet.
 */
function setupFixturesPython(fixturePaths: string[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* Effect.all(
      fixturePaths.map(fixturePath => {
        const fixtureDirName = path.basename(fixturePath);
        return Effect.gen(function* () {
          // Check if requirements.txt exists
          const requirementsPath = path.join(fixturePath, 'requirements.txt');
          const requirementsExists = yield* fs.exists(requirementsPath);

          if (!requirementsExists) {
            yield* Effect.logDebug(`Skipping ${fixtureDirName}: no requirements.txt found`);
            return;
          }

          // Read and parse requirements.txt
          const requirementsContent = yield* fs.readFileString(requirementsPath);
          const requirementsTxt = requirementsContent.split('\n');

          // Check if @composio/core is in dependencies or devDependencies
          const hasComposioCore = requirementsTxt.includes('composio_core');

          if (!hasComposioCore) {
            yield* Effect.logDebug(
              `Skipping ${fixtureDirName}: no \`composio_core\` dependency found`
            );
            return;
          }

          const setupShPath = path.join(fixturePath, 'setup.sh');
          const setupShExists = yield* fs.exists(setupShPath);

          if (!setupShExists) {
            yield* Effect.logDebug(`Skipping ${fixtureDirName}: no setup.sh found`);
            return;
          }

          yield* Effect.logDebug(`Setting up \`uv\` for fixture: ${fixtureDirName}`);

          const installCmd = Command.make(setupShPath);
          const exitCode = yield* installCmd.pipe(
            Command.workingDirectory(fixturePath),
            Command.runInShell(true),
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
        );
      }),
      { concurrency: 4 }
    );
  });
}

export async function setup() {
  const program = Effect.gen(function* () {
    // Path to the fixtures directory.
    // Note: we're using `__dirname` because `import.meta.resolve` is not yet available in Vitest.
    // See: https://github.com/vitest-dev/vitest/pull/5188.
    const fixturesDir = path.resolve(__dirname, '../__fixtures__');
    yield* Effect.logDebug(`Setting up TypeScript fixtures in ${fixturesDir}`);

    const fs = yield* FileSystem.FileSystem;

    // Get all fixture directories
    const fixtureEntries = yield* fs.readDirectory(fixturesDir);

    // Filter to only directories by checking each entry
    const fixtureDirNames: string[] = yield* Effect.all(
      fixtureEntries.map(entryName =>
        Effect.gen(function* () {
          const entryPath = path.join(fixturesDir, entryName);
          const stat = yield* fs.stat(entryPath);
          return stat.type === 'Directory' ? Option.some(entryPath) : Option.none<string>();
        }).pipe(Effect.catchAll(() => Effect.succeed(Option.none<string>())))
      )
    ).pipe(Effect.map(Option.all), Effect.map(Option.getOrElse(() => [] as string[])));

    yield* setupFixturesPython(fixtureDirNames);
    yield* setupFixturesTypeScript(fixtureDirNames);
  }).pipe(
    Effect.provide(BunFileSystem.layer),
    Effect.provide(BunContext.layer),
    Effect.provide(Logger.minimumLogLevel(LogLevel.Debug))
  );

  await Effect.runPromise(program);
}
