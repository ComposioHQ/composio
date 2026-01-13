/**
 * Peer dependency conflict detection test for @composio/core
 * 
 * Verifies that installing @composio/core alongside openai@6 and zod@4
 * does NOT produce peer dependency conflict warnings.
 * 
 * @see https://github.com/ComposioHQ/composio/issues/2336
 */

import * as Command from '@effect/platform/Command';
import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import * as Chunk from 'effect/Chunk';
import { pipe } from 'effect/Function';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTempProject } from '@test-e2e/utils/temp-project';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

const CONFLICT_PATTERNS = [
  'ERESOLVE overriding peer dependency',
  'Conflicting peer dependency',
  'Could not resolve dependency',
  'peer dep missing',
  'unmet peer',
];

const TestLive = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer)
);

/**
 * Collects a stream of Uint8Array chunks into a string.
 */
const collectStreamToString = (stream) =>
  pipe(
    stream,
    Stream.runCollect,
    Effect.map((chunks) => {
      const decoder = new TextDecoder('utf-8');
      return Chunk.toReadonlyArray(chunks)
        .map((chunk) => decoder.decode(chunk))
        .join('');
    })
  );

/**
 * Runs a command and captures both stdout and stderr.
 * Returns the combined output and exit code regardless of success/failure.
 */
const runCommandWithOutput = (cmd, args, cwd, env = {}) =>
  Effect.gen(function* () {
    const command = pipe(
      Command.make(cmd, ...args),
      Command.workingDirectory(cwd),
      Command.env({ ...process.env, ...env })
    );

    const process_ = yield* Command.start(command);

    // Collect stdout and stderr in parallel (MUST use concurrency to avoid deadlock)
    const [stdout, stderr] = yield* Effect.all(
      [
        collectStreamToString(process_.stdout),
        collectStreamToString(process_.stderr),
      ],
      { concurrency: 'unbounded' }
    );

    const exitCode = yield* process_.exitCode;

    return { stdout, stderr, exitCode };
  }).pipe(Effect.scoped);

/**
 * Logs command output in a formatted way.
 */
const logOutput = (label, stdout, stderr) =>
  Effect.sync(() => {
    if (stderr.trim()) {
      console.log(`\n--- ${label} stderr ---`);
      console.log(stderr);
      console.log(`--- end stderr ---\n`);
    }

    console.log(`--- ${label} stdout ---`);
    console.log(stdout);
    console.log(`--- end stdout ---`);
  });

const main = Effect.gen(function* () {
  console.log('🧪 Testing for peer dependency conflicts...\n');

  const { tempDir, cleanup } = yield* Effect.promise(() =>
    createTempProject('composio-peer-deps-test', FIXTURES_DIR)
  );
  console.log(`Created isolated test environment at ${tempDir}\n`);

  // Use acquireRelease to ensure cleanup runs regardless of success/failure
  yield* Effect.acquireUseRelease(
    Effect.succeed(tempDir),
    (dir) =>
      Effect.gen(function* () {
        let combinedStdout = '';
        let combinedStderr = '';

        // Run npm install and capture output
        console.log('Running npm install...');
        const npmResult = yield* runCommandWithOutput(
          'npm',
          ['install', '--legacy-peer-deps=false'],
          dir,
          { npm_config_yes: 'true' }
        );
        
        combinedStdout += npmResult.stdout;
        combinedStderr += npmResult.stderr;

        // Always log output (captured by DEBUG.log via Docker)
        yield* logOutput('npm', npmResult.stdout, npmResult.stderr);

        // Check for conflict patterns
        const npmOutput = npmResult.stdout + npmResult.stderr;
        const conflicts = CONFLICT_PATTERNS.filter((pattern) =>
          npmOutput.includes(pattern)
        );

        if (conflicts.length > 0) {
          console.error('❌ Found peer dependency conflict warnings:');
          conflicts.forEach((c) => console.error(`   - "${c}"`));
          console.error('\nIssue #2336 is NOT fixed.');
          return yield* Effect.fail(new Error('Peer dependency conflicts found'));
        }
        console.log('✅ No peer dependency conflict warnings\n');

        // Only continue if npm install succeeded
        if (npmResult.exitCode !== 0) {
          console.error(`❌ npm install failed with exit code ${npmResult.exitCode}`);
          return yield* Effect.fail(
            new Error(`npm install failed with exit code ${npmResult.exitCode}`)
          );
        }
        console.log('✅ npm install succeeded\n');

        // Run the test script to verify packages work together
        console.log('Running compatibility check...');
        const nodeResult = yield* runCommandWithOutput('node', ['index.mjs'], dir);
        
        combinedStdout += nodeResult.stdout;
        combinedStderr += nodeResult.stderr;

        // Always log output (captured by DEBUG.log via Docker)
        yield* logOutput('node', nodeResult.stdout, nodeResult.stderr);

        if (nodeResult.exitCode !== 0) {
          console.error('❌ Compatibility check failed');
          return yield* Effect.fail(new Error('Compatibility check failed'));
        }

        console.log('\n========================================');
        console.log('🎉 All tests passed!');
        console.log('========================================');

        return { stdout: combinedStdout, stderr: combinedStderr };
      }),
    () => Effect.promise(() => cleanup())
  );
});

Effect.runPromise(Effect.provide(main, TestLive)).catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
