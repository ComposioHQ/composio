import { WELL_KNOWN_NODE_VERSIONS, WELL_KNOWN_DENO_VERSIONS } from './const';

export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Enforces that a string literal type is non-empty.
 * Used with `const` type parameters to catch empty string literals at compile time.
 *
 * @example
 * function greet<const T extends string>(name: NonEmptyString<T>) { ... }
 * greet('Alice'); // OK
 * greet('');      // Error: Type 'string' is not assignable to type 'never'
 */
export type NonEmptyString<T extends string> = T extends '' ? never : T;

export type NodeVersionFromUser = typeof WELL_KNOWN_NODE_VERSIONS[number];
export type DenoVersionFromUser = typeof WELL_KNOWN_DENO_VERSIONS[number];

/**
 * Result of CI skip check for a specific Node version.
 */
export interface SkipInCI {
  value: boolean;
  reason?: string;
}

/**
 * Metadata for a resolved Node.js version to test against.
 * Includes skip state for CI mode.
 */
export type NodeVersionMeta =
  | { kind: 'static'; value: Exclude<typeof WELL_KNOWN_NODE_VERSIONS[number], 'current'>; skip: SkipInCI }
  | { kind: 'overridden'; value: string; skip: SkipInCI }
  | { kind: 'current'; value: string; skip: SkipInCI };

/**
 * Metadata for a resolved Deno version to test against.
 * Includes skip state for CI mode.
 */
export type DenoVersionMeta =
  | { kind: 'static'; value: Exclude<typeof WELL_KNOWN_DENO_VERSIONS[number], 'current'>; skip: SkipInCI }
  | { kind: 'overridden'; value: string; skip: SkipInCI }
  | { kind: 'current'; value: string; skip: SkipInCI };

/**
 * Runtime versions to test against.
 * Supports both Node.js and Deno runtimes.
 */
export interface RuntimeVersions {
  /** Node.js versions to test */
  node?: readonly NodeVersionFromUser[];
  /** Deno versions to test */
  deno?: readonly DenoVersionFromUser[];
}

/**
 * Result of executing a command in a Docker container.
 */
export interface E2ETestResult {
  /** Exit code from the command (0 = success) */
  exitCode: number;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
}

/**
 * Result of runFixture when a setup command is provided.
 * Top-level fields (exitCode, stdout, stderr) reflect the fixture result.
 */
export interface E2ETestResultWithSetup extends E2ETestResult {
  /** Result of the setup command execution */
  setup: E2ETestResult;
}

/**
 * Options for runFixture.
 */
export interface RunFixtureOptions {
  /** Fixture file path relative to cwd (e.g., 'index.mjs') */
  filename: string;
  /** Optional setup command to run before the fixture (e.g., 'npm install --legacy-peer-deps') */
  setup?: string;
}

/**
 * Supported runtime environments for e2e tests.
 */
export type RuntimeKind = 'node' | 'deno';

/**
 * Context passed to defineTests callback.
 */
export interface DefineTestsContext {
  /** The runtime environment for this test execution */
  runtime: RuntimeKind;
  /** Run an arbitrary command in the Docker container */
  runCmd: (command: string) => Promise<E2ETestResult>;
  /**
   * Run a fixture file with Node.js.
   *
   * Without setup: Runs `node <filename>` directly (no Docker volumes).
   * Returns E2ETestResult.
   *
   * With setup: Creates a Docker volume, runs the setup command (e.g., npm install)
   * with the volume mounted read-write, then runs the fixture with the volume
   * mounted read-only. Both commands run regardless of exit codes.
   * Returns E2ETestResultWithSetup.
   *
   * @example
   * // Simple fixture (no setup needed)
   * const result = await runFixture({ filename: 'test.mjs' });
   *
   * @example
   * // Fixture with setup (uses Docker volumes)
   * const result = await runFixture({
   *   filename: 'index.mjs',
   *   setup: 'npm install --legacy-peer-deps',
   * });
   * expect(result.setup.exitCode).toBe(0);
   */
  runFixture: {
    <const F extends string>(options: { filename: NonEmptyString<F> }): Promise<E2ETestResult>;
    <const F extends string, const S extends string>(options: {
      filename: NonEmptyString<F>;
      setup: NonEmptyString<S>;
    }): Promise<E2ETestResultWithSetup>;
  };
}

/**
 * Configuration for e2e tests.
 */
export interface E2EConfig {
  /**
   * Runtime versions to test against.
   * Supports Node.js and Deno runtimes.
   *
   * @example
   * ```typescript
   * versions: {
   *   node: ['20.19.0', '22.12.0'],
   *   deno: ['2.6.7'],
   * }
   * ```
   */
  versions?: RuntimeVersions;

  /**
   * Environment variables to pass to the Docker container.
   */
  env?: Record<string, string | undefined>;

  /**
   * When true, sets the working directory to {testDir}/fixtures for Docker commands.
   * This affects:
   * - Volume mount location (fixtures/node_modules instead of testDir/node_modules)
   * - Command execution cwd
   * - Fixture paths in runFixture (relative to fixtures/)
   *
   * @default false
   */
  usesFixtures?: boolean;

  /**
   * Define your tests using bun:test primitives.
   * Called once per Node version during test registration.
   *
   * @example
   * ```typescript
   * defineTests: ({ runFixture }) => {
   *   let result: E2ETestResult;
   *
   *   beforeAll(async () => {
   *     result = await runFixture({ filename: 'fixtures/test.mjs' });
   *   }, TIMEOUTS.FIXTURE);
   *
   *   describe('output', () => {
   *     it('exits successfully', () => {
   *       expect(result.exitCode).toBe(0);
   *     });
   *   });
   * }
   * ```
   */
  defineTests: (ctx: DefineTestsContext) => void;
}
