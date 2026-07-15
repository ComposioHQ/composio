/**
 * Patch eve's dev-runtime snapshot skip-list to exclude build output.
 *
 * eve ≤0.13 copies the whole app dir into `.eve/dev-runtime/snapshots/<id>/`
 * on every boot, skipping `node_modules` and `.git` — but not `.next`. A
 * multi-GB `.next` gets copied on every boot until the disk fills (ENOSPC)
 * and `bun run dev` dies. Upstream fixed this in eve 0.19+, so this script
 * no-ops there; remove it entirely once the repo upgrades.
 *
 * Patched from postinstall (not `bun patch`) because eve ships bundled deps
 * inside `dist/` with baked `.pnpm` paths, and `bun patch` strips nested
 * node_modules when packing — corrupting the package. Fails soft on any
 * layout change so installs never break.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Like the sibling scripts, this always runs from docs/ (package.json scripts).
const target = join(
  process.cwd(),
  'node_modules/eve/dist/src/internal/nitro/dev-runtime-source-snapshot-copy.js',
);

if (!existsSync(target)) {
  console.warn('[patch-eve] snapshot copier not found (eve layout changed?) — skipping');
  process.exit(0);
}

const src = readFileSync(target, 'utf8');
const skipList = src.match(/SNAPSHOT_SKIP_NAMES\s*=\s*new Set\(\[([^\]]*)\]\)/);

if (!skipList) {
  console.warn(
    '[patch-eve] skip-list not found (eve changed shape) — NOT patched; ' +
      'dev snapshots may include .next and fill the disk',
  );
  process.exit(0);
}

if (skipList[1].includes('.next')) {
  console.log('[patch-eve] eve snapshot skip-list already excludes .next');
  process.exit(0);
}

const patched = src.replace(
  skipList[0],
  skipList[0].replace('new Set([', 'new Set([`.next`,`.venv`,'),
);
writeFileSync(target, patched);
console.log('[patch-eve] added .next/.venv to eve dev-snapshot skip-list');
