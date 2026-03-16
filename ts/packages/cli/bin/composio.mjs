#!/usr/bin/env bun
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distBin = join(__dirname, '..', 'dist', 'bin.mjs');

if (!existsSync(distBin)) {
  console.error('Error: CLI not built yet. Run: pnpm build');
  process.exit(1);
}

import(distBin);
