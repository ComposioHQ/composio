import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { buildKbCatalog } from '@/lib/kb/catalog';
import {
  buildSupportKnowledgeSnapshot,
  verifySupportKnowledgeCheckout,
  writeSupportKnowledgeSnapshot,
} from '@/lib/kb/support-knowledge';
import type { KbManifest } from '@/lib/kb/types';

const args = process.argv.slice(2);

function argument(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const sourceRootArgument = argument('--source-root');
const sourceCommit = argument('--source-commit')?.trim();
if (!sourceRootArgument || !isAbsolute(sourceRootArgument)) {
  throw new Error('--source-root must be an absolute path to a support-knowledge checkout');
}
if (!sourceCommit) throw new Error('--source-commit is required');

const sourceRoot = realpathSync(sourceRootArgument);
const verifiedSourceCommit = verifySupportKnowledgeCheckout({ sourceRoot, sourceCommit });
const targetRoot = resolve(process.cwd(), 'kb');
const previousManifestPath = join(targetRoot, 'manifest.json');
const previousManifest = existsSync(previousManifestPath)
  ? JSON.parse(readFileSync(previousManifestPath, 'utf8')) as KbManifest
  : undefined;

const now = new Date();
const snapshot = buildSupportKnowledgeSnapshot({
  sourceRoot,
  sourceCommit: verifiedSourceCommit,
  previousManifest,
  now,
});

writeSupportKnowledgeSnapshot({
  snapshot,
  targetRoot,
  validate: stagedRoot => {
    buildKbCatalog(
      snapshot.manifest,
      sourcePath => readFileSync(join(stagedRoot, 'source', sourcePath), 'utf8'),
      now,
      articlePath => readFileSync(join(stagedRoot, 'articles', articlePath), 'utf8'),
    );
  },
});

console.log(
  `Imported ${snapshot.manifest.guides.length} public guides from ${verifiedSourceCommit}; run bun run generate:kb next.`,
);
