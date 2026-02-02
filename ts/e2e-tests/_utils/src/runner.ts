import { describe, beforeAll, afterAll, it } from 'bun:test';
import { appendFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  DefineTestsContext,
  E2EConfig,
  E2ETestResult,
  E2ETestResultWithSetup,
  NodeVersionMeta,
  DenoVersionMeta,
  NonEmptyString,
  RunFixtureOptions,
  RuntimeVersions,
  RuntimeKind,
} from './types';
import { getRepoRoot, resolveNodeVersionMetaList, resolveDenoVersionMetaList } from './config';
import { ensureNodeImage, runNodeContainer, ensureDenoImage, runDenoContainer } from './image-lifecycle';
import { WELL_KNOWN_ENV_VARS } from './const';
import { createVolume, generateVolumeName, initializeVolumeOwnership, removeVolume } from './volume';

// ============================================================================
// DEBUG.log Manager - Structured logging for e2e test output
// ============================================================================

/**
 * Result of a single phase execution.
 */
interface PhaseResult {
  phase: 'setup' | 'fixture';
  phaseIndex: number;
  totalPhases: number;
  command: string;
  containerName: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Aggregated results for a runtime version.
 */
interface VersionResult {
  runtime: RuntimeKind;
  version: string;
  status: 'pass' | 'fail' | 'skipped';
  reason?: string;
  imageTag?: string;
  phases: PhaseResult[];
  totalDurationMs?: number;
}

/**
 * Configuration for DebugLogManager.
 */
interface DebugLogManagerOptions {
  logPath: string;
  suiteName: string;
  testFilePath: string;
  runtimeVersions: string[];
}

/**
 * Manages structured DEBUG.log output for e2e tests.
 * Clears the file at initialization, groups phases by runtime version,
 * and writes a summary at the end.
 */
class DebugLogManager {
  private versionResults: VersionResult[] = [];
  private startTime: Date;
  private initialized = false;

  constructor(private options: DebugLogManagerOptions) {
    this.startTime = new Date();
  }

  /**
   * Initialize the log file - clears it and writes the header.
   * Must be called before any version sections are written.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const header = this.formatHeader();
    await writeFile(this.options.logPath, header, 'utf-8');
    this.initialized = true;
  }

  /**
   * Write a version section to the log file.
   * Call this after all phases for a version have completed.
   */
  async writeVersionSection(result: VersionResult): Promise<void> {
    // Ensure initialized (lazy init if needed)
    if (!this.initialized) {
      await this.initialize();
    }
    this.versionResults.push(result);
    const section = this.formatVersionSection(result);
    await appendFile(this.options.logPath, section, 'utf-8');
  }

  /**
   * Write the summary section to the log file.
   * Call this after all versions have completed.
   */
  async writeSummary(): Promise<void> {
    const summary = this.formatSummary();
    await appendFile(this.options.logPath, summary, 'utf-8');
  }

  private formatHeader(): string {
    const divider = '='.repeat(80);
    return [
      divider,
      `E2E Test: ${this.options.suiteName}`,
      `Started: ${this.startTime.toISOString()}`,
      `Test file: ${this.options.testFilePath}`,
      `Runtime versions: ${this.options.runtimeVersions.join(', ')}`,
      divider,
      '',
    ].join('\n');
  }

  private formatVersionSection(result: VersionResult): string {
    const dividerHeavy = '#'.repeat(80);
    const runtimeLabel = result.runtime === 'node' ? 'Node.js' : 'Deno';
    const lines: string[] = [
      '',
      dividerHeavy,
      `### ${runtimeLabel} ${result.version}${result.status === 'skipped' ? ' (SKIPPED)' : ''}`,
      dividerHeavy,
    ];

    if (result.status === 'skipped') {
      lines.push(`Reason: ${result.reason || 'No reason provided'}`);
    } else {
      if (result.imageTag) {
        lines.push(`Image: ${result.imageTag}`);
      }
      lines.push(''); // blank line before phases

      for (const phase of result.phases) {
        lines.push(...this.formatPhase(phase));
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private formatPhase(phase: PhaseResult): string[] {
    const exitStatus = phase.exitCode === 0 ? 'success' : 'failure';
    const durationSec = (phase.durationMs / 1000).toFixed(2);

    return [
      `--- Phase ${phase.phaseIndex}/${phase.totalPhases}: ${phase.phase} ---`,
      `Container: ${phase.containerName}`,
      `Command: ${phase.command}`,
      `Duration: ${durationSec}s`,
      `Exit Code: ${phase.exitCode} (${exitStatus})`,
      '',
      '[stdout]',
      phase.stdout?.trim() || '(empty)',
      '',
      '[stderr]',
      phase.stderr?.trim() || '(empty)',
      '',
    ];
  }

  private formatSummary(): string {
    const divider = '='.repeat(80);
    const endTime = new Date();
    const totalDurationMs = endTime.getTime() - this.startTime.getTime();
    const totalDurationSec = (totalDurationMs / 1000).toFixed(2);

    const lines: string[] = [
      divider,
      'Summary',
      divider,
    ];

    for (const result of this.versionResults) {
      const runtimeLabel = result.runtime === 'node' ? 'Node.js' : 'Deno';
      if (result.status === 'skipped') {
        lines.push(`${runtimeLabel} ${result.version}: SKIPPED`);
      } else {
        const status = result.status.toUpperCase();
        const phaseCount = result.phases.length;
        const versionDurationSec = result.totalDurationMs
          ? (result.totalDurationMs / 1000).toFixed(2)
          : '?';
        lines.push(`${runtimeLabel} ${result.version}: ${status} (${phaseCount} phases, ${versionDurationSec}s total)`);
      }
    }

    lines.push('');
    lines.push(`Finished: ${endTime.toISOString()}`);
    lines.push(`Total duration: ${totalDurationSec}s`);
    lines.push(divider);
    lines.push('');

    return lines.join('\n');
  }
}

// ============================================================================
// Container environment utilities
// ============================================================================


/**
 * Builds environment variables to pass to the container.
 * Merges auto-passthrough vars with explicitly provided env vars.
 */
function buildContainerEnv(
  explicitEnv?: Record<string, string | undefined>
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};

  for (const varName of WELL_KNOWN_ENV_VARS) {
    if (process.env[varName]) {
      env[varName] = process.env[varName];
    }
  }

  if (explicitEnv) {
    Object.assign(env, explicitEnv);
  }

  return env;
}

/**
 * Validates that env vars passed to E2EConfig don't have undefined values.
 * When a test passes `process.env.SOME_VAR` and it's not set, we want to
 * fail fast with a clear error rather than silently passing undefined to Docker.
 *
 * @param env - Environment variables from E2EConfig
 * @param suiteName - Test suite name for error context
 * @throws Error if any env vars have undefined values
 */
function validateRequiredEnvVars(
  env: Record<string, string | undefined> | undefined,
  suiteName: string
): void {
  if (!env) return;

  const missingVars = Object.entries(env)
    .filter(([, value]) => value === undefined)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `[${suiteName}] Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Set these variables before running the tests, or remove them from E2EConfig.env if not required.`
    );
  }
}

/**
 * Internal configuration for runE2E.
 */
interface RunE2EInternalConfig extends E2EConfig {
  cwd: string;
  suiteName: string;
}

/**
 * Context for tracking phase results within a version.
 */
interface VersionExecutionContext {
  phases: PhaseResult[];
  versionStartTime: number;
  imageTag: string;
}

// ============================================================================
// Node.js Docker Executors
// ============================================================================

/**
 * Creates Docker execution utilities for a specific Node.js version.
 */
function createNodeDockerExecutors(
  config: RunE2EInternalConfig,
  nodeVersion: string,
  imageTag: string,
  repoRoot: string,
  logManager: DebugLogManager
) {
  const { cwd, suiteName, env, usesFixtures } = config;
  const containerEnv = buildContainerEnv(env);
  const effectiveCwd = usesFixtures ? `${cwd}/fixtures` : cwd;

  const context: VersionExecutionContext = {
    phases: [],
    versionStartTime: Date.now(),
    imageTag,
  };

  const runCmd = async (command: string): Promise<E2ETestResult> => {
    const containerName = `e2e-${suiteName}-node-${nodeVersion.replace(/\./g, '-')}-${Date.now()}`;
    const startTime = Date.now();

    const result = await runNodeContainer({
      imageTag,
      cmd: command,
      cwd: effectiveCwd,
      env: containerEnv,
      name: containerName,
    });

    const durationMs = Date.now() - startTime;

    context.phases.push({
      phase: 'fixture',
      phaseIndex: context.phases.length + 1,
      totalPhases: context.phases.length + 1,
      command,
      containerName,
      durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    return result;
  };

  /**
   * Unified fixture runner with optional setup phase.
   *
   * Without setup: Runs `node <filename>` directly (no Docker volumes).
   * With setup: Creates a Docker volume, runs setup command with volume mounted
   * read-write, then runs the fixture with volume mounted read-only.
   */
  function runFixture<const F extends string>(options: { filename: NonEmptyString<F> }): Promise<E2ETestResult>;
  function runFixture<const F extends string, const S extends string>(options: { filename: NonEmptyString<F>; setup: NonEmptyString<S> }): Promise<E2ETestResultWithSetup>;
  async function runFixture(options: RunFixtureOptions): Promise<E2ETestResult | E2ETestResultWithSetup> {
    const { filename, setup } = options;

    if (!setup) {
      return runCmd(`node ${filename}`);
    }

    const volumeName = generateVolumeName(suiteName, nodeVersion);
    const containerBaseName = `e2e-${suiteName}-node-${nodeVersion.replace(/\./g, '-')}-${Date.now()}`;
    const volumeTarget = `${effectiveCwd.startsWith('/') ? effectiveCwd : `/app/${effectiveCwd}`}/node_modules`;

    try {
      await createVolume(volumeName);
      await initializeVolumeOwnership(volumeName, imageTag, 'node');

      const setupContainerName = `${containerBaseName}-setup`;
      const setupStartTime = Date.now();
      const setupResult = await runNodeContainer({
        imageTag,
        cmd: setup,
        cwd: effectiveCwd,
        env: containerEnv,
        name: setupContainerName,
        volumes: [{ volume: volumeName, target: volumeTarget, readonly: false }],
      });
      const setupDurationMs = Date.now() - setupStartTime;

      context.phases.push({
        phase: 'setup',
        phaseIndex: 1,
        totalPhases: 2,
        command: setup,
        containerName: setupContainerName,
        durationMs: setupDurationMs,
        exitCode: setupResult.exitCode,
        stdout: setupResult.stdout,
        stderr: setupResult.stderr,
      });

      const fixtureContainerName = `${containerBaseName}-fixture`;
      const fixtureStartTime = Date.now();
      const fixtureResult = await runNodeContainer({
        imageTag,
        cmd: `node ${filename}`,
        cwd: effectiveCwd,
        env: containerEnv,
        name: fixtureContainerName,
        volumes: [{ volume: volumeName, target: volumeTarget, readonly: true }],
      });
      const fixtureDurationMs = Date.now() - fixtureStartTime;

      context.phases.push({
        phase: 'fixture',
        phaseIndex: 2,
        totalPhases: 2,
        command: `node ${filename}`,
        containerName: fixtureContainerName,
        durationMs: fixtureDurationMs,
        exitCode: fixtureResult.exitCode,
        stdout: fixtureResult.stdout,
        stderr: fixtureResult.stderr,
      });

      return { ...fixtureResult, setup: setupResult };
    } finally {
      await removeVolume(volumeName);
    }
  }

  const finalizeVersionLog = async (): Promise<void> => {
    const totalDurationMs = Date.now() - context.versionStartTime;
    const allPassed = context.phases.every(p => p.exitCode === 0);
    const status: 'pass' | 'fail' = allPassed ? 'pass' : 'fail';

    await logManager.writeVersionSection({
      runtime: 'node',
      version: nodeVersion,
      status,
      imageTag: context.imageTag,
      phases: context.phases,
      totalDurationMs,
    });
  };

  return { runCmd, runFixture, finalizeVersionLog, context };
}

// ============================================================================
// Deno Docker Executors
// ============================================================================

/**
 * Creates Docker execution utilities for a specific Deno version.
 */
function createDenoDockerExecutors(
  config: RunE2EInternalConfig,
  denoVersion: string,
  imageTag: string,
  repoRoot: string,
  logManager: DebugLogManager
) {
  const { cwd, suiteName, env, usesFixtures } = config;
  const containerEnv = buildContainerEnv(env);
  const effectiveCwd = usesFixtures ? `${cwd}/fixtures` : cwd;

  const context: VersionExecutionContext = {
    phases: [],
    versionStartTime: Date.now(),
    imageTag,
  };

  const runCmd = async (command: string): Promise<E2ETestResult> => {
    const containerName = `e2e-${suiteName}-deno-${denoVersion.replace(/\./g, '-')}-${Date.now()}`;
    const startTime = Date.now();

    const result = await runDenoContainer({
      imageTag,
      cmd: command,
      cwd: effectiveCwd,
      env: containerEnv,
      name: containerName,
    });

    const durationMs = Date.now() - startTime;

    context.phases.push({
      phase: 'fixture',
      phaseIndex: context.phases.length + 1,
      totalPhases: context.phases.length + 1,
      command,
      containerName,
      durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    return result;
  };

  function runFixture(options: { filename: string }): Promise<E2ETestResult>;
  function runFixture(options: { filename: string; setup: string }): Promise<E2ETestResultWithSetup>;
  async function runFixture(options: RunFixtureOptions): Promise<E2ETestResult | E2ETestResultWithSetup> {
    const { filename, setup } = options;
    // Deno scripts need explicit 'deno run' with permissions
    const denoRunCmd = `deno run --allow-all ${filename}`;

    // For Deno without setup, just run the file directly
    if (!setup) {
      return runCmd(denoRunCmd);
    }

    // Deno with setup: use Docker volumes for caching
    const volumeName = generateVolumeName(suiteName, denoVersion);
    const containerBaseName = `e2e-${suiteName}-deno-${denoVersion.replace(/\./g, '-')}-${Date.now()}`;
    // Deno caches to DENO_DIR, but we also support node_modules for npm packages
    const volumeTarget = `${effectiveCwd.startsWith('/') ? effectiveCwd : `/app/${effectiveCwd}`}/node_modules`;

    try {
      await createVolume(volumeName);
      await initializeVolumeOwnership(volumeName, imageTag, 'deno');

      const setupContainerName = `${containerBaseName}-setup`;
      const setupStartTime = Date.now();
      const setupResult = await runDenoContainer({
        imageTag,
        cmd: setup,
        cwd: effectiveCwd,
        env: containerEnv,
        name: setupContainerName,
        volumes: [{ volume: volumeName, target: volumeTarget, readonly: false }],
      });
      const setupDurationMs = Date.now() - setupStartTime;

      context.phases.push({
        phase: 'setup',
        phaseIndex: 1,
        totalPhases: 2,
        command: setup,
        containerName: setupContainerName,
        durationMs: setupDurationMs,
        exitCode: setupResult.exitCode,
        stdout: setupResult.stdout,
        stderr: setupResult.stderr,
      });

      const fixtureContainerName = `${containerBaseName}-fixture`;
      const fixtureStartTime = Date.now();
      const fixtureResult = await runDenoContainer({
        imageTag,
        cmd: denoRunCmd,
        cwd: effectiveCwd,
        env: containerEnv,
        name: fixtureContainerName,
        volumes: [{ volume: volumeName, target: volumeTarget, readonly: true }],
      });
      const fixtureDurationMs = Date.now() - fixtureStartTime;

      context.phases.push({
        phase: 'fixture',
        phaseIndex: 2,
        totalPhases: 2,
        command: denoRunCmd,
        containerName: fixtureContainerName,
        durationMs: fixtureDurationMs,
        exitCode: fixtureResult.exitCode,
        stdout: fixtureResult.stdout,
        stderr: fixtureResult.stderr,
      });

      return { ...fixtureResult, setup: setupResult };
    } finally {
      await removeVolume(volumeName);
    }
  }

  const finalizeVersionLog = async (): Promise<void> => {
    const totalDurationMs = Date.now() - context.versionStartTime;
    const allPassed = context.phases.every(p => p.exitCode === 0);
    const status: 'pass' | 'fail' = allPassed ? 'pass' : 'fail';

    await logManager.writeVersionSection({
      runtime: 'deno',
      version: denoVersion,
      status,
      imageTag: context.imageTag,
      phases: context.phases,
      totalDurationMs,
    });
  };

  return { runCmd, runFixture, finalizeVersionLog, context };
}

// ============================================================================
// Version normalization and resolution
// ============================================================================

/**
 * Normalize config to support both old (nodeVersions) and new (versions) formats.
 */
function normalizeVersionConfig(config: E2EConfig): RuntimeVersions {
  // New format takes precedence
  if (config.versions) {
    return config.versions;
  }
  // Legacy format
  if (config.nodeVersions) {
    return { node: config.nodeVersions };
  }
  // Default: use current Node.js version
  return { node: ['current'] };
}

/**
 * Render a Node.js version meta for display in test names.
 */
function renderNodeVersionMeta({ kind, value }: NodeVersionMeta): string {
  switch (kind) {
    case 'current':
      return `Node.js ${value} [current]`;
    case 'overridden':
      return `Node.js ${value} [overridden]`;
    case 'static':
      return `Node.js ${value}`;
  }
}

/**
 * Render a Deno version meta for display in test names.
 */
function renderDenoVersionMeta({ kind, value }: DenoVersionMeta): string {
  switch (kind) {
    case 'current':
      return `Deno ${value} [current]`;
    case 'overridden':
      return `Deno ${value} [overridden]`;
    case 'static':
      return `Deno ${value}`;
  }
}

// ============================================================================
// Main test runner
// ============================================================================

/**
 * Runs e2e tests using bun:test.
 * Creates a describe block per runtime version and passes test utilities to defineTests.
 *
 * Supports both Node.js and Deno runtimes.
 * In CI mode, versions not matching their respective env vars are skipped.
 */
export function runE2E(config: RunE2EInternalConfig): void {
  const { cwd, suiteName, defineTests, env } = config;

  // Validate env vars early, before any Docker operations
  validateRequiredEnvVars(env, suiteName);

  const versions = normalizeVersionConfig(config);
  const repoRoot = getRepoRoot();

  // Resolve versions for each runtime
  const nodeVersionMetaList = versions.node ? resolveNodeVersionMetaList(versions.node) : [];
  const denoVersionMetaList = versions.deno ? resolveDenoVersionMetaList(versions.deno) : [];

  // Build runtime version labels for logging
  const allRuntimeVersions = [
    ...nodeVersionMetaList.map(v => `Node.js ${v.value}`),
    ...denoVersionMetaList.map(v => `Deno ${v.value}`),
  ];

  // Create the debug log manager for structured output
  const logPath = resolve(repoRoot, cwd, 'DEBUG.log');
  const logManager = new DebugLogManager({
    logPath,
    suiteName,
    testFilePath: `${cwd}/e2e.test.ts`,
    runtimeVersions: allRuntimeVersions,
  });

  // Wrap all tests in a top-level describe to handle initialization and summary
  describe(suiteName, () => {
    // Initialize log file before any tests run
    beforeAll(async () => {
      await logManager.initialize();
    });

    // =========== Node.js Tests ===========
    for (const nodeVersionMeta of nodeVersionMetaList) {
      const testName = renderNodeVersionMeta(nodeVersionMeta);

      // Skip this version in CI if not selected
      if (nodeVersionMeta.skip.value) {
        describe(`${testName} - skipped: ${nodeVersionMeta.skip.reason}`, () => {
          beforeAll(async () => {
            await logManager.writeVersionSection({
              runtime: 'node',
              version: nodeVersionMeta.value,
              status: 'skipped',
              reason: nodeVersionMeta.skip.reason || 'Skipped in CI',
              phases: [],
            });
          });

          it.skip('this version should not run in this CI matrix job', () => {});
        });
        continue;
      }

      describe(testName, () => {
        let executors: ReturnType<typeof createNodeDockerExecutors>;

        beforeAll(async () => {
          const imageTag = await ensureNodeImage(nodeVersionMeta.value, { repoRoot });
          executors = createNodeDockerExecutors(config, nodeVersionMeta.value, imageTag, repoRoot, logManager);
        }, 600_000);

        defineTests({
          runtime: 'node',
          runCmd: (cmd) => executors.runCmd(cmd),
          runFixture: ((opts: RunFixtureOptions) => executors.runFixture(opts)) as DefineTestsContext['runFixture'],
        });

        afterAll(async () => {
          if (executors) {
            await executors.finalizeVersionLog();
          }
        });
      });
    }

    // =========== Deno Tests ===========
    for (const denoVersionMeta of denoVersionMetaList) {
      const testName = renderDenoVersionMeta(denoVersionMeta);

      // Skip this version in CI if not selected
      if (denoVersionMeta.skip.value) {
        describe(`${testName} - skipped: ${denoVersionMeta.skip.reason}`, () => {
          beforeAll(async () => {
            await logManager.writeVersionSection({
              runtime: 'deno',
              version: denoVersionMeta.value,
              status: 'skipped',
              reason: denoVersionMeta.skip.reason || 'Skipped in CI',
              phases: [],
            });
          });

          it('this version should not run in this CI matrix job', () => {});
        });
        continue;
      }

      describe(testName, () => {
        let executors: ReturnType<typeof createDenoDockerExecutors>;

        beforeAll(async () => {
          const imageTag = await ensureDenoImage(denoVersionMeta.value, { repoRoot });
          executors = createDenoDockerExecutors(config, denoVersionMeta.value, imageTag, repoRoot, logManager);
        }, 600_000);

        defineTests({
          runtime: 'deno',
          runCmd: (cmd) => executors.runCmd(cmd),
          runFixture: ((opts: RunFixtureOptions) => executors.runFixture(opts)) as DefineTestsContext['runFixture'],
        });

        afterAll(async () => {
          if (executors) {
            await executors.finalizeVersionLog();
          }
        });
      });
    }

    // Write summary after all versions complete
    afterAll(async () => {
      await logManager.writeSummary();
    });
  });
}
