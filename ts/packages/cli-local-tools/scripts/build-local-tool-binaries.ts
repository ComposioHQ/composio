#!/usr/bin/env bun

import { $ } from 'bun';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');

const targetAliases = new Map<string, string>([
  ['bun-darwin-arm64', 'darwin-arm64'],
  ['bun-darwin-aarch64', 'darwin-arm64'],
  ['composio-darwin-aarch64', 'darwin-arm64'],
  ['darwin-aarch64', 'darwin-arm64'],
  ['darwin-arm64', 'darwin-arm64'],
  ['bun-darwin-x64', 'darwin-x64'],
  ['composio-darwin-x64', 'darwin-x64'],
  ['darwin-x64', 'darwin-x64'],
  ['bun-linux-x64', 'linux-x64'],
  ['composio-linux-x64', 'linux-x64'],
  ['linux-x64', 'linux-x64'],
  ['bun-linux-arm64', 'linux-arm64'],
  ['bun-linux-aarch64', 'linux-arm64'],
  ['composio-linux-aarch64', 'linux-arm64'],
  ['linux-aarch64', 'linux-arm64'],
  ['linux-arm64', 'linux-arm64'],
]);

const parseTargetArg = (): string | undefined => {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  const targetIndex = args.indexOf('--target');
  if (targetIndex >= 0) return args[targetIndex + 1];
  return args.find(arg => !arg.startsWith('--'));
};

const detectHostTarget = (): string => {
  if (process.platform === 'darwin') {
    return process.arch === 'x64' ? 'darwin-x64' : 'darwin-arm64';
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
  return `${process.platform}-${process.arch}`;
};

const normalizeTarget = (target?: string): string => {
  const value = target ?? detectHostTarget();
  return targetAliases.get(value) ?? value;
};

const runScript = async (scriptName: string, target: string) => {
  await $`bun run ${path.join('scripts', scriptName)} --target ${target}`.cwd(packageRoot);
};

const main = async () => {
  const target = normalizeTarget(parseTargetArg());

  if (!target.startsWith('darwin-')) {
    console.log(`Skipping native local-tool binary build for non-macOS target: ${target}`);
    return;
  }

  if (process.platform !== 'darwin') {
    throw new Error(
      `Building native local-tool binaries for ${target} requires a macOS runner with the Swift toolchain.`
    );
  }

  console.log(`Building native local-tool binaries for ${target}...`);
  await runScript('build-beeper-imessage-binaries.ts', target);
  await runScript('build-peekaboo-binaries.ts', target);
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
