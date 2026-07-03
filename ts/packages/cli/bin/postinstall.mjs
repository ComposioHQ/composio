#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isGlobalInstall =
  process.env.npm_config_global === 'true' || process.env.npm_config_location === 'global';

if (!isGlobalInstall || process.env.CI) {
  process.exit(0);
}

if (!(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY)) {
  console.error('Run `composio onboard` from an interactive terminal to finish setup.');
  process.exit(0);
}

const cli = fileURLToPath(new URL('./composio.mjs', import.meta.url));
const result = spawnSync(cli, ['onboard'], { stdio: 'inherit' });

if (result.error || result.status !== 0) {
  console.error('Onboarding did not finish. Run `composio onboard` to continue.');
}
