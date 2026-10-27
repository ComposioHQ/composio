import { fileURLToPath } from 'node:url';
import { checkApiSnippets, loadApiSpecs } from '../lib/api-snippets';
import { listCodeExampleFiles } from '../lib/code-examples';

const USAGE = 'Usage: bun scripts/check-api-snippets.ts [--json]';
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--json');
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(' ')}\n${USAGE}`);
  process.exit(2);
}

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const files = listCodeExampleFiles(docsRoot);
const violations = checkApiSnippets(files, loadApiSpecs(docsRoot));
const counts: Record<string, number> = {};
for (const violation of violations) counts[violation.rule] = (counts[violation.rule] ?? 0) + 1;
const sortedCounts = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (args.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, violations, counts: sortedCounts }, null, 2));
} else if (violations.length) {
  for (const { path, line, rule, message } of violations) console.log(`${path}:${line} ${rule} ${message}`);
  const fileCount = new Set(violations.map((violation) => violation.path)).size;
  console.log(`\n${violations.length} API snippet violation(s) in ${fileCount} of ${files.length} file(s):`);
  for (const [rule, count] of Object.entries(sortedCounts)) console.log(`  ${rule}: ${count}`);
} else {
  console.log(`No API snippet violations in ${files.length} file(s).`);
}

process.exit(violations.length ? 1 : 0);
