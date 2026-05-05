#!/usr/bin/env bun

import { $ } from 'bun';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageRoot, '../../..');
const submodulePath = path.join(packageRoot, 'vendor/platform-imessage');
const submoduleRelativePath = path.relative(repoRoot, submodulePath);
const outputRoot = path.join(packageRoot, 'local-tools-binaries/beeper-imessage');

const upstreamRepository = 'https://github.com/ComposioHQ/platform-imessage';

const targets = [
  {
    platform: 'darwin-arm64',
    swiftArch: 'arm64',
    buildPath: '.build/arm64-apple-macosx/release/imessage-cli',
  },
  {
    platform: 'darwin-x64',
    swiftArch: 'x86_64',
    buildPath: '.build/x86_64-apple-macosx/release/imessage-cli',
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

// BetterSwiftAX 0.1.0 references AXWebConstants added in newer macOS SDKs.
// The constants are plain CFString subrole names, so patch the resolved package
// checkout to string literals before building on GitHub macos-15 runners.
const betterSwiftAxSubroleFallbacks = [
  ['kAXLandmarkComplementarySubrole', 'AXLandmarkComplementary'],
  ['kAXLandmarkContentInfoSubrole', 'AXLandmarkContentInfo'],
  ['kAXLandmarkMainSubrole', 'AXLandmarkMain'],
  ['kAXLandmarkNavigationSubrole', 'AXLandmarkNavigation'],
  ['kAXLandmarkRegionSubrole', 'AXLandmarkRegion'],
  ['kAXLandmarkSearchSubrole', 'AXLandmarkSearch'],
  ['kAXMathFenceOperatorSubrole', 'AXMathFenceOperator'],
  ['kAXMathFencedSubrole', 'AXMathFenced'],
  ['kAXMathFractionSubrole', 'AXMathFraction'],
  ['kAXMathIdentifierSubrole', 'AXMathIdentifier'],
  ['kAXMathMultiscriptSubrole', 'AXMathMultiscript'],
  ['kAXMathNumberSubrole', 'AXMathNumber'],
  ['kAXMathOperatorSubrole', 'AXMathOperator'],
  ['kAXMathRootSubrole', 'AXMathRoot'],
  ['kAXMathRowSubrole', 'AXMathRow'],
  ['kAXMathSeparatorOperatorSubrole', 'AXMathSeparatorOperator'],
  ['kAXMathSquareRootSubrole', 'AXMathSquareRoot'],
  ['kAXMathSubscriptSuperscriptSubrole', 'AXMathSubscriptSuperscript'],
  ['kAXMathTableCellSubrole', 'AXMathTableCell'],
  ['kAXMathTableRowSubrole', 'AXMathTableRow'],
  ['kAXMathTableSubrole', 'AXMathTable'],
  ['kAXMathTextSubrole', 'AXMathText'],
  ['kAXMathUnderOverSubrole', 'AXMathUnderOver'],
  ['kAXMeterSubrole', 'AXMeter'],
  ['kAXRubyInlineSubrole', 'AXRubyInline'],
  ['kAXRubyTextSubrole', 'AXRubyText'],
  ['kAXSubscriptStyleGroupSubrole', 'AXSubscriptStyleGroup'],
  ['kAXSummarySubrole', 'AXSummary'],
  ['kAXSuperscriptStyleGroupSubrole', 'AXSuperscriptStyleGroup'],
  ['kAXTabPanelSubrole', 'AXTabPanel'],
  ['kAXTermSubrole', 'AXTerm'],
  ['kAXTimeGroupSubrole', 'AXTimeGroup'],
  ['kAXUserInterfaceTooltipSubrole', 'AXUserInterfaceTooltip'],
  ['kAXVideoSubrole', 'AXVideo'],
  ['kAXWebApplicationSubrole', 'AXWebApplication'],
] as const;

const ensurePlatform = () => {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Building Beeper iMessage local-tool binaries requires macOS and the Swift toolchain.'
    );
  }
};

const ensureSubmodule = async () => {
  if (await exists(path.join(submodulePath, 'Package.swift'))) return;

  console.log(`Initializing ${submoduleRelativePath} submodule...`);
  await $`git submodule update --init --recursive -- ${submoduleRelativePath}`.cwd(repoRoot);

  if (!(await exists(path.join(submodulePath, 'Package.swift')))) {
    throw new Error(
      `Missing platform-imessage submodule at ${submoduleRelativePath}. Run: git submodule update --init --recursive -- ${submoduleRelativePath}`
    );
  }
};

const getSubmoduleCommit = async (): Promise<string> =>
  (await $`git rev-parse HEAD`.cwd(submodulePath).text()).trim();

const getSubmoduleVersion = async (): Promise<string> => {
  const packageJson = await readJson<{ version?: string }>(
    path.join(submodulePath, 'package.json')
  );
  return packageJson.version ?? 'unknown';
};

const copyLicense = async () => {
  const licenseCandidates = ['license.txt', 'LICENSE.txt', 'LICENSE', 'LICENSE.md'];
  for (const candidate of licenseCandidates) {
    const sourcePath = path.join(submodulePath, candidate);
    if (await exists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(outputRoot, 'LICENSE.txt'));
      return;
    }
  }
  throw new Error('No upstream license file found in platform-imessage submodule.');
};

const patchBetterSwiftAxForCurrentSdk = async () => {
  await $`swift package resolve`.cwd(submodulePath);

  const sourcePath = path.join(
    submodulePath,
    '.build/checkouts/BetterSwiftAX/Sources/AccessibilityControl/Accessibility+Subrole.swift'
  );
  if (!(await exists(sourcePath))) {
    throw new Error(
      'Swift package resolution completed but BetterSwiftAX Accessibility+Subrole.swift was not found.'
    );
  }

  const source = await fs.readFile(sourcePath, 'utf8');
  let patched = source;
  for (const [constantName, stringValue] of betterSwiftAxSubroleFallbacks) {
    patched = patched.replaceAll(`= ${constantName}`, `= ("${stringValue}" as CFString)`);
  }

  if (patched !== source) {
    await fs.chmod(sourcePath, 0o644).catch(() => undefined);
    await fs.writeFile(sourcePath, patched, 'utf8');
    console.log('Patched BetterSwiftAX subrole constants for older macOS SDKs.');
  }
};

const buildTarget = async (target: Target) => {
  console.log(`Building imessage-cli for ${target.platform} (${target.swiftArch})...`);
  await patchBetterSwiftAxForCurrentSdk();
  await $`swift build -c release --product imessage-cli --arch ${target.swiftArch}`.cwd(
    submodulePath
  );

  const builtBinary = path.join(submodulePath, target.buildPath);
  if (!(await exists(builtBinary))) {
    throw new Error(`Swift build completed but ${target.buildPath} was not produced.`);
  }

  const targetDir = path.join(outputRoot, target.platform);
  const outputBinary = path.join(targetDir, 'imessage-cli');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(builtBinary, outputBinary);
  await fs.chmod(outputBinary, 0o755);
  console.log(`Wrote ${path.relative(repoRoot, outputBinary)}`);
};

const writeNotice = async (params: { version: string; commit: string }) => {
  const notice = `# Beeper platform-imessage CLI binary

These \`imessage-cli\` binaries are built from the Composio fork of Beeper platform-imessage.

- Upstream fork: \`${upstreamRepository}\`
- Upstream version: \`${params.version}\`
- Upstream submodule commit: \`${params.commit}\`
- License: MIT (\`license.txt\` in the upstream repository)
- Build command: \`pnpm --filter @composio/cli-local-tools build:beeper-imessage -- --target <darwin-arm64|darwin-x64>\`
- Underlying Swift build commands:
  - \`swift build -c release --product imessage-cli --arch arm64\`
  - \`swift build -c release --product imessage-cli --arch x86_64\`

The binaries are stripped release builds for macOS arm64 and x64. They require local macOS Messages data and may prompt for Messages Data, Accessibility, Contacts, and Automation permissions depending on the command.
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
