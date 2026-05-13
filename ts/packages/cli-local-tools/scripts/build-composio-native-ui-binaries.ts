#!/usr/bin/env bun

import { $ } from 'bun';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageRoot, '../../..');
const swiftPackagePath = path.join(packageRoot, 'native/composio-native-ui');
const outputRoot = path.join(packageRoot, 'local-tools-binaries/composio-native-ui');

const targets = [
  {
    platform: 'darwin-arm64',
    swiftArch: 'arm64',
    buildPath: '.build/arm64-apple-macosx/release/composio-native-ui',
  },
  {
    platform: 'darwin-x64',
    swiftArch: 'x86_64',
    buildPath: '.build/x86_64-apple-macosx/release/composio-native-ui',
  },
] as const;

type Target = (typeof targets)[number];

const exists = async (filePath: string): Promise<boolean> =>
  fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);

const ensurePlatform = () => {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Building the Composio native UI sidecar requires macOS and the Swift toolchain.'
    );
  }
};

const buildTarget = async (target: Target) => {
  console.log(`Building composio-native-ui for ${target.platform} (${target.swiftArch})...`);
  await $`swift build -c release --product composio-native-ui --arch ${target.swiftArch}`.cwd(
    swiftPackagePath
  );

  const builtBinary = path.join(swiftPackagePath, target.buildPath);
  if (!(await exists(builtBinary))) {
    throw new Error(`Swift build completed but ${target.buildPath} was not produced.`);
  }

  const targetDir = path.join(outputRoot, target.platform);
  const outputBinary = path.join(targetDir, 'composio-native-ui');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(builtBinary, outputBinary);
  await fs.chmod(outputBinary, 0o755);
  console.log(`Wrote ${path.relative(repoRoot, outputBinary)}`);
};

const writeNotice = async () => {
  const notice = `# Composio native UI sidecar

The \`composio-native-ui\` binaries are built from the in-repository Swift package at \`ts/packages/cli-local-tools/native/composio-native-ui\`.

- Purpose: native macOS UI surface that the Bun-compiled Composio CLI can spawn for auth flows, tool pickers, and other desktop affordances.
- Build command: \`pnpm --filter @composio/cli-local-tools build:composio-native-ui -- --target <darwin-arm64|darwin-x64>\`
- Underlying Swift build commands:
  - \`swift build -c release --product composio-native-ui --arch arm64\`
  - \`swift build -c release --product composio-native-ui --arch x86_64\`

The scaffold currently opens a small AppKit panel near the bottom-right corner of the active screen. Generated executables are intentionally not committed; release jobs rebuild them before packaging CLI artifacts.
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
  await fs.mkdir(outputRoot, { recursive: true });
  const selectedTargets = parseTargets();
  for (const target of selectedTargets) {
    await buildTarget(target);
  }
  await writeNotice();
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
