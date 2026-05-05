#!/usr/bin/env bun

import { $ } from 'bun';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageRoot, '../../..');
const submodulePath = path.join(packageRoot, 'vendor/peekaboo');
const submoduleRelativePath = path.relative(repoRoot, submodulePath);
const cliPackagePath = path.join(submodulePath, 'Apps/CLI');
const outputRoot = path.join(packageRoot, 'local-tools-binaries/peekaboo');

const upstreamRepository = 'https://github.com/steipete/Peekaboo';

const targets = [
  {
    platform: 'darwin-arm64',
    swiftArch: 'arm64',
    buildPath: 'Apps/CLI/.build/arm64-apple-macosx/release/peekaboo',
  },
  {
    platform: 'darwin-x64',
    swiftArch: 'x86_64',
    buildPath: 'Apps/CLI/.build/x86_64-apple-macosx/release/peekaboo',
  },
] as const;

type Target = (typeof targets)[number];

const exists = async (filePath: string): Promise<boolean> =>
  fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await fs.readFile(filePath, 'utf8')) as T;

const ensurePlatform = () => {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Building Peekaboo local-tool binaries requires macOS and the Swift toolchain.'
    );
  }
};

const ensureSubmodule = async () => {
  if (!(await exists(path.join(submodulePath, 'Apps/CLI/Package.swift')))) {
    console.log(`Initializing ${submoduleRelativePath} submodule...`);
    await $`git submodule update --init --recursive -- ${submoduleRelativePath}`.cwd(repoRoot);
  }

  if (!(await exists(path.join(submodulePath, 'Apps/CLI/Package.swift')))) {
    throw new Error(
      `Missing Peekaboo submodule at ${submoduleRelativePath}. Run: git submodule update --init --recursive -- ${submoduleRelativePath}`
    );
  }

  if (!(await exists(path.join(submodulePath, 'Commander/Package.swift')))) {
    console.log(`Initializing nested Peekaboo submodules...`);
    await $`git submodule update --init --recursive`.cwd(submodulePath);
  }

  if (!(await exists(path.join(submodulePath, 'Commander/Package.swift')))) {
    throw new Error('Missing nested Peekaboo submodules after initialization.');
  }
};

const getSubmoduleCommit = async (): Promise<string> =>
  (await $`git rev-parse HEAD`.cwd(submodulePath).text()).trim();

const getSubmoduleVersion = async (): Promise<string> => {
  const versionJson = await readJson<{ version?: string }>(
    path.join(submodulePath, 'version.json')
  );
  return versionJson.version ?? 'unknown';
};

const copyLicense = async () => {
  const licenseCandidates = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'];
  for (const candidate of licenseCandidates) {
    const sourcePath = path.join(submodulePath, candidate);
    if (await exists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(outputRoot, 'LICENSE.txt'));
      return;
    }
  }
  throw new Error('No upstream license file found in Peekaboo submodule.');
};

const buildTarget = async (target: Target) => {
  console.log(`Building peekaboo for ${target.platform} (${target.swiftArch})...`);
  await $`swift build --arch ${target.swiftArch} -c release -Xswiftc -Osize -Xswiftc -wmo -Xlinker -dead_strip`.cwd(
    cliPackagePath
  );

  const builtBinary = path.join(submodulePath, target.buildPath);
  if (!(await exists(builtBinary))) {
    throw new Error(`Swift build completed but ${target.buildPath} was not produced.`);
  }

  const targetDir = path.join(outputRoot, target.platform);
  const outputBinary = path.join(targetDir, 'peekaboo');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(builtBinary, outputBinary);
  await fs.chmod(outputBinary, 0o755);
  console.log(`Wrote ${path.relative(repoRoot, outputBinary)}`);
};

const writeNotice = async (params: { version: string; commit: string }) => {
  const notice = `# Peekaboo CLI binary

These \`peekaboo\` binaries are built from the upstream Peekaboo repository.

- Upstream repository: \`${upstreamRepository}\`
- Upstream version: \`${params.version}\`
- Upstream submodule commit: \`${params.commit}\`
- License: MIT (\`LICENSE\` in the upstream repository)
- Build command: \`pnpm --filter @composio/cli-local-tools build:peekaboo -- --target <darwin-arm64|darwin-x64>\`
- Underlying Swift build command: \`swift build --arch <arm64|x86_64> -c release -Xswiftc -Osize -Xswiftc -wmo -Xlinker -dead_strip\` from \`Apps/CLI\`

The binaries are release builds for macOS. Peekaboo requires macOS 15+, Screen Recording permission for capture/read tools, and Accessibility/Automation permissions for GUI control tools.
`;
  await fs.writeFile(path.join(outputRoot, 'NOTICE.md'), notice, 'utf8');
};

const parseTargets = (): ReadonlyArray<Target> => {
  const rawArgs = process.argv.slice(2).filter(arg => arg !== '--');
  const targetIndex = rawArgs.indexOf('--target');
  const args =
    targetIndex >= 0 && rawArgs[targetIndex + 1]
      ? [rawArgs[targetIndex + 1]!]
      : rawArgs.filter(arg => !arg.startsWith('--'));

  if (args.length === 0 || args.includes('all')) return targets;

  const selected = targets.filter(target => args.includes(target.platform));
  const unknown = args.filter(arg => !targets.some(target => target.platform === arg));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown target(s): ${unknown.join(', ')}. Expected one of: all, ${targets
        .map(target => target.platform)
        .join(', ')}`
    );
  }
  return selected;
};

const main = async () => {
  ensurePlatform();
  await ensureSubmodule();

  await fs.mkdir(outputRoot, { recursive: true });
  const selectedTargets = parseTargets();
  for (const target of selectedTargets) {
    await buildTarget(target);
  }

  await copyLicense();
  await writeNotice({
    version: await getSubmoduleVersion(),
    commit: await getSubmoduleCommit(),
  });
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
