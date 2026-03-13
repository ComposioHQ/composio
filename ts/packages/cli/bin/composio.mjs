#!/usr/bin/env node

// Version guard — must use only ES5-compatible syntax so it parses on older Node.js.
if (parseInt(process.versions.node.split('.')[0], 10) < 22) {
  process.stderr.write(
    'Error: composio requires Node.js >= 22.0.0 (you have ' +
    process.version + ').\n\n' +
    'Upgrade Node.js: https://nodejs.org/en/download\n' +
    'Or install as a standalone binary (no Node.js needed):\n' +
    '  curl -fsSL https://composio.dev/install | bash\n'
  );
  process.exit(1);
}

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
