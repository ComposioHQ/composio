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
 * Docker mount configuration.
 */
export interface DockerMount {
  source: string;
  target: string;
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
 * Creates default Docker labels for e2e images.
 */
function defaultLabels(nodeVersion?: string): Record<string, string> {
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
    ...labelsToArgs(defaultLabels(nodeVersion)),
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
  const { imageTag, cmd, cwd, mounts, env, labels, name } = options;

  // Validate imageTag is provided, as it determines which Docker image to run.
  if (!imageTag || typeof imageTag !== 'string') {
    throw new Error('runNodeContainer({ imageTag, ... }): imageTag must be a non-empty string');
  }

  const nodeVersion = parseNodeVersionFromImageTag(imageTag);

  const dockerArgs = ['run', '--rm'];

  dockerArgs.push(...labelsToArgs({ ...defaultLabels(nodeVersion), ...(labels ?? {}) }));

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
