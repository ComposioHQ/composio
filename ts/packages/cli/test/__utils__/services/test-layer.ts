import path from 'node:path';
import * as tempy from 'tempy';
import { CliApp } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { BunFileSystem, BunContext, BunPath } from '@effect/platform-bun';
import { Console, DateTime, Effect, Layer, Logger, LogLevel, Schedule } from 'effect';
import { CliConfigLive } from 'src/bin';
import * as MockConsole from './mock-console';
import * as MockTerminal from './mock-terminal';
import type { Toolkits } from 'src/models/toolkits';
import { NodeProcess } from 'src/services/node-process';
import {
  ComposioSessionRepository,
  ComposioToolkitsRepository,
} from 'src/services/composio-clients';
import { EnvLangDetector } from 'src/services/env-lang-detector';
import { JsPackageManagerDetector } from 'src/services/js-package-manager-detector';
import type { Tools } from 'src/models/tools';
import type { TriggerTypes } from 'src/models/trigger-types';

interface TestLiveInput {
  /**
   * Fixture to use in test.
   */
  fixture?: string;

  /**
   * Mock toolkit-related data to use in test.
   */
  toolkitsData?: {
    toolkits?: Toolkits;
    tools?: Tools;
    triggerTypes?: TriggerTypes;
  };
}

/**
 * Effect layer that injects all the services needed for tests, using mocks to avoid
 * side-effects like unwanted HTTP requests to remote services.
 */
export const TestLayer = (input?: TestLiveInput) =>
  Effect.gen(function* () {
    const defaultAppClientData = {
      toolkits: [],
      tools: [],
      triggerTypes: [],
    } satisfies TestLiveInput['toolkitsData'];
    const { fixture, toolkitsData } = Object.assign(
      { fixture: undefined, toolkitsData: defaultAppClientData },
      input
    );

    const tempDir = tempy.temporaryDirectory({ prefix: 'test' });
    const cwd = (yield* setupFixtureFolder({ fixture, tempDir })) ?? tempDir;

    const composioToolkitsRepositoryTest = new ComposioToolkitsRepository({
      getToolkits: () => Effect.succeed(toolkitsData.toolkits),
      getTools: () => Effect.succeed(toolkitsData.tools),
      getTriggerTypes: () => Effect.succeed(toolkitsData.triggerTypes),
    });
    const ComposioToolkitsRepositoryTest = Layer.succeed(
      ComposioToolkitsRepository,
      composioToolkitsRepositoryTest
    );

    const ComposioSessionRepositoryTest = yield* setupComposioSessionRepository();

    // Mock `node:process`
    const nodeProcessTest = new NodeProcess({
      cwd,
      platform: 'darwin',
      arch: 'arm64',
    });
    const NodeProcessTest = Layer.succeed(NodeProcess, nodeProcessTest);

    const _console = yield* MockConsole.effect;

    const layers = Layer.mergeAll(
      Console.setConsole(_console),
      NodeProcessTest,
      CliConfigLive,
      ComposioSessionRepositoryTest,
      ComposioToolkitsRepositoryTest,
      EnvLangDetector.Default,
      JsPackageManagerDetector.Default,
      BunFileSystem.layer,
      BunContext.layer,
      MockTerminal.layer,
      BunPath.layer
    );

    return layers;
  }).pipe(Logger.withMinimumLogLevel(LogLevel.Info), Layer.unwrapScoped);

// Run @effect/vitest suite with TestLive layer
// export const runEffect =
//   (input?: TestLiveInput) =>
//   <E, A>(self: Effect.Effect<A, E, CliApp.CliApp.Environment>): Promise<A> =>
//     Effect.provide(self, TestLayer(input)).pipe(Effect.scoped, Effect.runPromise);

function setupFixtureFolder({ fixture, tempDir }: { fixture?: string; tempDir: string }) {
  return Effect.gen(function* () {
    if (fixture === undefined) {
      return;
    }

    const fs = yield* FileSystem.FileSystem;

    const realFixturePath = path.resolve(
      new URL('.', import.meta.url).pathname,
      '..',
      '..',
      '__fixtures__',
      fixture
    );
    const tmpFixturesPath = path.join(tempDir, 'test', '__fixtures__', fixture);

    yield* Effect.logDebug(`Using fixture at: ${tmpFixturesPath}`);

    // Retry the task with a delay between retries and a maximum of 3 retries
    const policy = Schedule.addDelay(Schedule.recurs(3), () => '100 millis');

    // If all retries fail, run the fallback effect
    const task = Effect.gen(function* () {
      yield* fs.makeDirectory(tmpFixturesPath, { recursive: true });
      yield* fs.copy(realFixturePath, tmpFixturesPath);
    });

    const repeated = Effect.retryOrElse(policy, () =>
      Effect.die(`Failed to copy fixture to: ${tmpFixturesPath}`)
    );

    yield* repeated(task);

    yield* Effect.logDebug(`Copied fixture to: ${tmpFixturesPath}`);

    return tmpFixturesPath;
  }).pipe(Effect.provide(BunFileSystem.layer));
}

function setupComposioSessionRepository() {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const sessionId = 'te00st11-d0c4-4efa-8117-c638886063e0';
    const sessionCode = '001122';
    const expiresAt = DateTime.add(now, { minutes: 10 });

    const accountName = 'test-name';
    const accountId = 'test-id';
    const accountEmail = 'test.name@gmail.com';

    const account = {
      name: accountName,
      id: accountId,
      email: accountEmail,
    };

    const composioSessionRepositoryTest = new ComposioSessionRepository({
      createSession: () =>
        Effect.succeed({
          id: sessionId,
          code: sessionCode,
          expiresAt,
          status: 'pending',
        }),
      retrieveSession: () =>
        Effect.succeed({
          id: sessionId,
          code: sessionCode,
          expiresAt,
          status: 'pending',
        }),
      linkSession: () =>
        Effect.succeed({
          id: sessionId,
          code: sessionCode,
          expiresAt,
          status: 'linked',
          account,
        }),
    });
    const ComposioSessionRepositoryTest = Layer.succeed(
      ComposioSessionRepository,
      composioSessionRepositoryTest
    );

    return ComposioSessionRepositoryTest;
  });
}
