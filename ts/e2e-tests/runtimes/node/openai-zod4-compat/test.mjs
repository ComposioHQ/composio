/**
 * Peer dependency conflict detection test for @composio/core
 * 
 * Verifies that installing @composio/core alongside openai@6 and zod@4
 * does NOT produce peer dependency conflict warnings.
 * 
 * Docker provides isolation - no temp directory needed.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

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
  console.log('🧪 Testing @composio/core + openai + zod@4 compatibility...\n');
  console.log(`Fixtures directory: ${FIXTURES_DIR}\n`);

  // Install dependencies in fixtures directory (ignore workspace to download from npm)
  console.log('Installing fixtures dependencies...');
  const installResult = yield* runCommandWithOutput('npm', ['install', '--legacy-peer-deps=false'], FIXTURES_DIR, {
    npm_config_yes: 'true',
  });

  // Always log output (captured by DEBUG.log via Docker)
  yield* logOutput('pnpm install', installResult.stdout, installResult.stderr);

  if (installResult.exitCode !== 0) {
    console.error('❌ pnpm install failed');
    return yield* Effect.fail(new Error('pnpm install failed'));
  }
  console.log('✅ Dependencies installed\n');

  // Run the compatibility check script
  console.log('Running compatibility check...');
  const nodeResult = yield* runCommandWithOutput('node', ['index.mjs'], FIXTURES_DIR);

  // Always log output (captured by DEBUG.log via Docker)
  yield* logOutput('node', nodeResult.stdout, nodeResult.stderr);

  if (nodeResult.exitCode !== 0) {
    console.error('❌ Compatibility check failed');
    return yield* Effect.fail(new Error('Compatibility check failed'));
  }

  console.log('\n========================================');
  console.log('🎉 All tests passed!');
  console.log('========================================');

  return { stdout: nodeResult.stdout, stderr: nodeResult.stderr };
});

Effect.runPromise(Effect.provide(main, TestLive)).catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
