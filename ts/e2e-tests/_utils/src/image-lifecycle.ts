import { $ } from 'bun';
import { resolve } from 'node:path';
import { getRepoRoot } from './config';

/**
 * Result of executing a command.
 */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Options for exec function.
 */
interface ExecOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Docker bind mount configuration.
 */
export interface DockerMount {
  source: string;
  target: string;
  readonly?: boolean;
}

/**
 * Docker named volume mount configuration.
 */
export interface DockerVolumeMount {
  /** Named volume name (must be created with `docker volume create` first) */
  volume: string;
  /** Container path to mount the volume at */
  target: string;
  /** Whether to mount read-only */
  readonly?: boolean;
}

/**
 * Options for running a Node container.
 */
export interface RunNodeContainerOptions {
  imageTag: string;
  cmd: string | string[];
  cwd?: string;
  mounts?: DockerMount[];
  /** Named volume mounts (volumes must be created beforehand with `docker volume create`) */
  volumes?: DockerVolumeMount[];
  env?: Record<string, string | undefined>;
  labels?: Record<string, string>;
  name?: string;
}

/**
 * Options for ensureNodeImage.
 */
export interface EnsureNodeImageOptions {
  repoRoot?: string;
  dockerfilePath?: string;
}

/**
 * Options for checkDocker.
 */
export interface CheckDockerOptions {
  repoRoot?: string;
}

/**
 * Escapes a shell argument for safe use in Bun shell raw strings.
 */
function escapeShellArg(arg: string): string {
  // Single-quote the arg and escape any embedded single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Creates default Docker labels for Node.js e2e images.
 */
function defaultNodeLabels(nodeVersion?: string): Record<string, string> {
  const labels: Record<string, string> = {
    'composio.e2e': 'true',
    'composio.runtime': 'node',
  };
  if (nodeVersion) {
    labels['composio.node_version'] = nodeVersion;
  }
  return labels;
}

/**
 * Creates default Docker labels for Deno e2e images.
 */
function defaultDenoLabels(denoVersion?: string): Record<string, string> {
  const labels: Record<string, string> = {
    'composio.e2e': 'true',
    'composio.runtime': 'deno',
  };
  if (denoVersion) {
    labels['composio.deno_version'] = denoVersion;
  }
  return labels;
}

/**
 * Converts labels object to Docker CLI arguments array.
 */
function labelsToArgs(labels: Record<string, string> = {}): string[] {
  const args: string[] = [];
  for (const [k, v] of Object.entries(labels)) {
    args.push('--label', `${k}=${v}`);
  }
  return args;
}

/**
 * Executes a command and captures stdout/stderr using Bun shell.
 */
async function exec(cmd: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const { cwd, env } = options;
  const escapedArgs = args.map(escapeShellArg).join(' ');

  let shell = $`${{ raw: cmd }} ${{ raw: escapedArgs }}`
    .nothrow()
    .quiet();

  if (cwd) {
    shell = shell.cwd(cwd);
  }

  if (env) {
    shell = shell.env({ ...process.env, ...env });
  }

  const result = await shell;

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/**
 * Checks if Docker is available.
 */
export async function checkDocker(options: CheckDockerOptions = {}): Promise<ExecResult> {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  return exec('docker', ['info'], { cwd: repoRoot });
}

/**
 * Creates image tag for a given Node version.
 */
function imageTagForNodeVersion(nodeVersion: string): string {
  return `composio-e2e-node:${nodeVersion}`;
}

/**
 * Parses Node version from an image tag.
 */
function parseNodeVersionFromImageTag(imageTag: string): string | undefined {
  const match = /^composio-e2e-node:(.+)$/.exec(imageTag);
  return match?.[1];
}

/**
 * Ensures a Docker image exists for the given Node version, building it if necessary.
 */
export async function ensureNodeImage(
  nodeVersion: string,
  options: EnsureNodeImageOptions = {}
): Promise<string> {
  if (!nodeVersion || typeof nodeVersion !== 'string') {
    throw new Error(`ensureNodeImage(${nodeVersion}): nodeVersion must be a non-empty string`);
  }

  const repoRoot = options.repoRoot ?? getRepoRoot();
  const dockerfilePath = options.dockerfilePath ?? resolve(repoRoot, 'ts/e2e-tests/_utils/Dockerfile.node');
  const imageTag = imageTagForNodeVersion(nodeVersion);

  const inspect = await exec('docker', ['image', 'inspect', imageTag], { cwd: repoRoot });
  if (inspect.exitCode === 0) {
    return imageTag;
  }

  const buildArgs = [
    'build',
    '-f',
    dockerfilePath,
    '--build-arg',
    `NODE_VERSION=${nodeVersion}`,
    ...labelsToArgs(defaultNodeLabels(nodeVersion)),
    '-t',
    imageTag,
    repoRoot,
  ];

  const built = await exec('docker', buildArgs, { cwd: repoRoot });
  if (built.exitCode !== 0) {
    const err = new Error(`Failed to build Docker image ${imageTag}`);
    (err as Error & { cause: Error }).cause = new Error(built.stderr || built.stdout);
    throw err;
  }

  return imageTag;
}

/**
 * Runs a command in a Node Docker container.
 */
export async function runNodeContainer(options: RunNodeContainerOptions): Promise<ExecResult> {
  const { imageTag, cmd, cwd, mounts, volumes, env, labels, name } = options;

  // Validate imageTag is provided, as it determines which Docker image to run.
  if (!imageTag || typeof imageTag !== 'string') {
    throw new Error('runNodeContainer({ imageTag, ... }): imageTag must be a non-empty string');
  }

  const nodeVersion = parseNodeVersionFromImageTag(imageTag);

  const dockerArgs = ['run', '--rm'];

  dockerArgs.push(...labelsToArgs({ ...defaultNodeLabels(nodeVersion), ...(labels ?? {}) }));

  // Assign a custom container name for easier identification and cleanup.
  if (name) {
    dockerArgs.push('--name', name);
  }

  // Set the working directory inside the container, defaulting relative paths to /app.
  if (cwd) {
    const containerCwd = cwd.startsWith('/') ? cwd : `/app/${cwd}`;
    dockerArgs.push('--workdir', containerCwd);
  }

  // Pass environment variables to the container for runtime configuration.
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      // Skip undefined values to avoid passing empty env vars to Docker.
      if (v === undefined) continue;
      dockerArgs.push('-e', `${k}=${v}`);
    }
  }

  // Configure bind mounts to share host directories with the container.
  if (mounts) {
    for (const m of mounts) {
      // Ensure each mount has required source and target paths.
      if (!m?.source || !m?.target) {
        throw new Error('runNodeContainer(...): each mount must have { source, target }');
      }
      const parts = [`type=bind`, `src=${m.source}`, `dst=${m.target}`];
      // Mark mount as read-only to prevent container from modifying host files.
      if (m.readonly) parts.push('readonly');
      dockerArgs.push('--mount', parts.join(','));
    }
  }

  // Configure named volume mounts for sharing state between container runs.
  if (volumes) {
    for (const v of volumes) {
      // Ensure each volume mount has required volume name and target path.
      if (!v?.volume || !v?.target) {
        throw new Error('runNodeContainer(...): each volume must have { volume, target }');
      }
      const parts = [`type=volume`, `src=${v.volume}`, `dst=${v.target}`];
      // Mark mount as read-only if specified.
      if (v.readonly) parts.push('readonly');
      dockerArgs.push('--mount', parts.join(','));
    }
  }

  dockerArgs.push(imageTag);

  // Handle cmd as array for direct execution without shell interpretation.
  if (Array.isArray(cmd)) {
    dockerArgs.push(...cmd.map(String));
  // Handle cmd as string by wrapping in login shell for proper environment setup.
  } else if (typeof cmd === 'string' && cmd.length > 0) {
    dockerArgs.push('sh', '-lc', cmd);
  } else {
    throw new Error('runNodeContainer({ cmd, ... }): cmd must be a non-empty string or string[]');
  }

  return exec('docker', dockerArgs);
}

// ============================================================================
// Deno Docker utilities
// ============================================================================

/**
 * Options for running a Deno container.
 */
export interface RunDenoContainerOptions {
  imageTag: string;
  cmd: string | string[];
  cwd?: string;
  mounts?: DockerMount[];
  /** Named volume mounts (volumes must be created beforehand with `docker volume create`) */
  volumes?: DockerVolumeMount[];
  env?: Record<string, string | undefined>;
  labels?: Record<string, string>;
  name?: string;
}

/**
 * Options for ensureDenoImage.
 */
export interface EnsureDenoImageOptions {
  repoRoot?: string;
  dockerfilePath?: string;
}

/**
 * Creates image tag for a given Deno version.
 */
function imageTagForDenoVersion(denoVersion: string): string {
  return `composio-e2e-deno:${denoVersion}`;
}

/**
 * Parses Deno version from an image tag.
 */
function parseDenoVersionFromImageTag(imageTag: string): string | undefined {
  const match = /^composio-e2e-deno:(.+)$/.exec(imageTag);
  return match?.[1];
}

/**
 * Ensures a Docker image exists for the given Deno version, building it if necessary.
 */
export async function ensureDenoImage(
  denoVersion: string,
  options: EnsureDenoImageOptions = {}
): Promise<string> {
  if (!denoVersion || typeof denoVersion !== 'string') {
    throw new Error(`ensureDenoImage(${denoVersion}): denoVersion must be a non-empty string`);
  }

  const repoRoot = options.repoRoot ?? getRepoRoot();
  const dockerfilePath = options.dockerfilePath ?? resolve(repoRoot, 'ts/e2e-tests/_utils/Dockerfile.deno');
  const imageTag = imageTagForDenoVersion(denoVersion);

  const inspect = await exec('docker', ['image', 'inspect', imageTag], { cwd: repoRoot });
  if (inspect.exitCode === 0) {
    return imageTag;
  }

  const buildArgs = [
    'build',
    '-f',
    dockerfilePath,
    '--build-arg',
    `DENO_VERSION=${denoVersion}`,
    ...labelsToArgs(defaultDenoLabels(denoVersion)),
    '-t',
    imageTag,
    repoRoot,
  ];

  const built = await exec('docker', buildArgs, { cwd: repoRoot });
  if (built.exitCode !== 0) {
    const err = new Error(`Failed to build Docker image ${imageTag}`);
    (err as Error & { cause: Error }).cause = new Error(built.stderr || built.stdout);
    throw err;
  }

  return imageTag;
}

/**
 * Runs a command in a Deno Docker container.
 */
export async function runDenoContainer(options: RunDenoContainerOptions): Promise<ExecResult> {
  const { imageTag, cmd, cwd, mounts, volumes, env, labels, name } = options;

  // Validate imageTag is provided, as it determines which Docker image to run.
  if (!imageTag || typeof imageTag !== 'string') {
    throw new Error('runDenoContainer({ imageTag, ... }): imageTag must be a non-empty string');
  }

  const denoVersion = parseDenoVersionFromImageTag(imageTag);

  const dockerArgs = ['run', '--rm'];

  dockerArgs.push(...labelsToArgs({ ...defaultDenoLabels(denoVersion), ...(labels ?? {}) }));

  // Assign a custom container name for easier identification and cleanup.
  if (name) {
    dockerArgs.push('--name', name);
  }

  // Set the working directory inside the container, defaulting relative paths to /app.
  if (cwd) {
    const containerCwd = cwd.startsWith('/') ? cwd : `/app/${cwd}`;
    dockerArgs.push('--workdir', containerCwd);
  }

  // Pass environment variables to the container for runtime configuration.
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      // Skip undefined values to avoid passing empty env vars to Docker.
      if (v === undefined) continue;
      dockerArgs.push('-e', `${k}=${v}`);
    }
  }

  // Configure bind mounts to share host directories with the container.
  if (mounts) {
    for (const m of mounts) {
      // Ensure each mount has required source and target paths.
      if (!m?.source || !m?.target) {
        throw new Error('runDenoContainer(...): each mount must have { source, target }');
      }
      const parts = [`type=bind`, `src=${m.source}`, `dst=${m.target}`];
      // Mark mount as read-only to prevent container from modifying host files.
      if (m.readonly) parts.push('readonly');
      dockerArgs.push('--mount', parts.join(','));
    }
  }

  // Configure named volume mounts for sharing state between container runs.
  if (volumes) {
    for (const v of volumes) {
      // Ensure each volume mount has required volume name and target path.
      if (!v?.volume || !v?.target) {
        throw new Error('runDenoContainer(...): each volume must have { volume, target }');
      }
      const parts = [`type=volume`, `src=${v.volume}`, `dst=${v.target}`];
      // Mark mount as read-only if specified.
      if (v.readonly) parts.push('readonly');
      dockerArgs.push('--mount', parts.join(','));
    }
  }

  dockerArgs.push(imageTag);

  // Handle cmd as array for direct execution without shell interpretation.
  if (Array.isArray(cmd)) {
    dockerArgs.push(...cmd.map(String));
  // Handle cmd as string by wrapping in login shell for proper environment setup.
  // Callers must explicitly use 'deno run --allow-all <file>' when running Deno scripts.
  } else if (typeof cmd === 'string' && cmd.length > 0) {
    dockerArgs.push('sh', '-lc', cmd);
  } else {
    throw new Error('runDenoContainer({ cmd, ... }): cmd must be a non-empty string or string[]');
  }

  return exec('docker', dockerArgs);
}
