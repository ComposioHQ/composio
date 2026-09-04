// Guards the CLI's Effect platform boundaries: every eslint-disable comment in
// src/ must be a single-line `eslint-disable-next-line` with a `-- reason`
// justification, and must be registered in lint-boundaries.json. The manifest
// pins each rule, justification, and governed next-line target, so adding or
// relocating a disable fails until the manifest is regenerated on purpose (see
// AGENTS.md, "Effect Boundary Policy").
//
// Usage:
//   tsx ./scripts/validate-lint-boundaries.ts            # verify (CI)
//   tsx ./scripts/validate-lint-boundaries.ts --update   # regenerate manifest
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  collectBoundaryManifest,
  compareBoundaryManifests,
  countBoundarySites,
  type BoundaryManifest,
} from './lint-boundaries';

const scriptDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const packageRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(packageRoot, 'src');
const manifestPath = path.join(packageRoot, 'lint-boundaries.json');

const collected = collectBoundaryManifest(packageRoot, srcRoot);
const errors = [...collected.errors];
const found = collected.manifest;

if (process.argv.includes('--update')) {
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    console.error('\nFix the malformed disables above before regenerating the manifest.');
    process.exit(1);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(found, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(packageRoot, manifestPath)} (${Object.keys(found).length} files).`
  );
  process.exit(0);
}

const manifest: BoundaryManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
errors.push(...compareBoundaryManifests(found, manifest));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `lint boundaries OK: ${countBoundarySites(found)} registered disables across ${Object.keys(found).length} files.`
);
