#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const isGlobalInstall =
  process.env.npm_config_global === 'true' || process.env.npm_config_location === 'global';
const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY);
const isCi = process.env.CI === 'true';

if (!isGlobalInstall || isCi) {
  process.exit(0);
}

if (!isTty) {
  console.error('To finish Composio setup, run: composio onboard');
  process.exit(0);
}

const result = spawnSync('composio', ['onboard'], { stdio: 'inherit' });
if (result.error) {
  console.error('Composio onboarding did not start automatically. Run: composio onboard');
  process.exit(0);
}

process.exit(result.status ?? 0);
