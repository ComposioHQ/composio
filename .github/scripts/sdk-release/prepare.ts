import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PYTHON_RELEASE_FAMILY } from './contracts';
import {
  collectTypeScriptRelease,
  listPendingChangesetIds,
  readTypeScriptPackageMetadata,
  type TypeScriptReleasePackage,
} from './collect-typescript-release';

export interface CommandInvocation {
  command: string;
  args: string[];
  cwd: string;
}

export interface CommandResult {
  stdout: string;
}

export type CommandRunner = (invocation: CommandInvocation) => Promise<CommandResult>;

const PythonSetterReportSchema = z
  .object({
    packages: z.array(
      z
        .object({
          name: z.string().min(1),
          version: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();
type PythonSetterReport = z.infer<typeof PythonSetterReportSchema>;

export interface PythonReleasePackage {
  ecosystem: 'python';
  name: string;
  version: string;
  registry: 'pypi';
}

export interface PrepareSdkVersionsOptions {
  repositoryRoot: string;
  scope: 'typescript' | 'python' | 'combined';
  pythonVersion?: string;
  expectedPythonFamily?: readonly string[];
  run?: CommandRunner;
}

export interface PreparedSdkVersions {
  typescript_packages: TypeScriptReleasePackage[];
  python_packages: PythonReleasePackage[];
  changeset_ids: string[];
  deferred_changeset_ids: string[];
  python_release_family: string[];
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const pythonSetterPath = resolve(scriptDirectory, '../../../python/scripts/set-release-version.py');
const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

async function runCommand(invocation: CommandInvocation): Promise<CommandResult> {
  const process = Bun.spawn([invocation.command, ...invocation.args], {
    cwd: invocation.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${invocation.command} ${invocation.args.join(' ')} failed (${exitCode})\n${stderr || stdout}`
    );
  }
  return { stdout };
}

function assertPythonFamily(
  report: PythonSetterReport,
  expectedFamily: readonly string[],
  version: string
): PythonReleasePackage[] {
  const actualNames = report.packages.map(item => item.name).sort(compareText);
  const expectedNames = [...expectedFamily].sort(compareText);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Python release family mismatch: expected ${expectedNames.join(', ')}, received ${actualNames.join(', ')}`
    );
  }
  for (const packageMetadata of report.packages) {
    if (packageMetadata.version !== version) {
      throw new Error(
        `Python release family version mismatch: ${packageMetadata.name} is ${packageMetadata.version}, expected ${version}`
      );
    }
  }
  return report.packages
    .map(packageMetadata => ({
      ecosystem: 'python' as const,
      name: packageMetadata.name,
      version: packageMetadata.version,
      registry: 'pypi' as const,
    }))
    .sort((left, right) => compareText(left.name, right.name));
}

function providerLockDirectories(pythonRoot: string): string[] {
  const providersRoot = join(pythonRoot, 'providers');
  return readdirSync(providersRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(providersRoot, entry.name, 'uv.lock')))
    .map(entry => join(providersRoot, entry.name))
    .sort(compareText);
}

export async function prepareSdkVersions(
  options: PrepareSdkVersionsOptions
): Promise<PreparedSdkVersions> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const run = options.run ?? runCommand;
  const includesTypeScript = options.scope !== 'python';
  const includesPython = options.scope !== 'typescript';
  const pendingChangesets = listPendingChangesetIds(repositoryRoot);
  let changesetIds: string[] = [];
  let deferredChangesetIds: string[] = [];
  let typescriptPackages: TypeScriptReleasePackage[] = [];
  let pythonPackages: PythonReleasePackage[] = [];

  if (includesTypeScript) {
    if (pendingChangesets.length === 0) {
      throw new Error('No pending Changesets for a selected TypeScript release');
    }
    const before = readTypeScriptPackageMetadata(repositoryRoot);
    await run({ command: 'pnpm', args: ['validate:changesets'], cwd: repositoryRoot });
    await run({ command: 'pnpm', args: ['changeset', 'version'], cwd: repositoryRoot });
    typescriptPackages = collectTypeScriptRelease(before, repositoryRoot);
    changesetIds = pendingChangesets;
  } else {
    deferredChangesetIds = pendingChangesets;
  }

  if (includesPython) {
    if (!options.pythonVersion) {
      throw new Error('Python preparation requires an exact target version');
    }
    const pythonRoot = join(repositoryRoot, 'python');
    const setter = await run({
      command: 'python3',
      args: [pythonSetterPath, '--python-root', pythonRoot, '--version', options.pythonVersion],
      cwd: repositoryRoot,
    });
    let report: PythonSetterReport;
    try {
      report = PythonSetterReportSchema.parse(JSON.parse(setter.stdout));
    } catch {
      throw new Error('Python version setter returned invalid JSON');
    }
    pythonPackages = assertPythonFamily(
      report,
      options.expectedPythonFamily ?? PYTHON_RELEASE_FAMILY,
      options.pythonVersion
    );

    await run({ command: 'uv', args: ['lock'], cwd: repositoryRoot });
    for (const providerRoot of providerLockDirectories(pythonRoot)) {
      await run({ command: 'uv', args: ['lock'], cwd: providerRoot });
    }
  }

  return {
    typescript_packages: typescriptPackages,
    python_packages: pythonPackages,
    changeset_ids: changesetIds,
    deferred_changeset_ids: deferredChangesetIds,
    python_release_family: pythonPackages.map(item => item.name),
  };
}

function parseArguments(args: string[]): Omit<PrepareSdkVersionsOptions, 'repositoryRoot'> {
  const value = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const scope = value('--scope');
  if (scope !== 'typescript' && scope !== 'python' && scope !== 'combined') {
    throw new Error('--scope must be typescript, python, or combined');
  }
  return { scope, pythonVersion: value('--python-version') };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const result = await prepareSdkVersions({
      repositoryRoot: process.cwd(),
      ...parseArguments(process.argv.slice(2)),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
