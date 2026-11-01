// Runs the Effect language service over the CLI's sources and tests, and fails
// on any error-level diagnostic. The one this exists for is `floatingEffect`:
// an Effect that is created and never yielded, such as a client call whose
// result is dropped, compiles and silently never runs.
//
// The language service needs TypeScript's JS API, which the workspace's
// TypeScript 7 does not ship, so it runs against this package's TypeScript 6
// alias. It loads `typescript/lib/tsserverlibrary` from its own location, so
// symlinks are preserved to resolve that from this package's node_modules, and
// NODE_PATH lets the alias load the TypeScript 6 package it re-exports.
//
// Usage:
//   tsx ./scripts/check-effect-diagnostics.ts
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const scriptDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const packageRoot = path.resolve(scriptDir, '..');
const nodeModules = path.join(packageRoot, 'node_modules');
// <store>/node_modules/@typescript/typescript6 -> <store>/node_modules
const typescriptAliasModules = path.resolve(
  fs.realpathSync(path.join(nodeModules, 'typescript')),
  '..',
  '..'
);

const result = spawnSync(
  process.execPath,
  [
    '--preserve-symlinks',
    '--preserve-symlinks-main',
    path.join(nodeModules, '@effect', 'language-service', 'cli.js'),
    'diagnostics',
    '--project',
    path.join(packageRoot, 'tsconfig.test.json'),
    '--severity',
    'error',
    '--format',
    process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'text',
  ],
  {
    cwd: packageRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: typescriptAliasModules },
  }
);

process.exit(result.status ?? 1);
