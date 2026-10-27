import { fileURLToPath } from 'node:url';
import { checkCodeExamples, listCodeExampleFiles, inventoryCodeExamples } from '../lib/code-examples';

const USAGE = 'Usage: bun scripts/check-code-examples.ts [--json] [--inventory]';
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--json' && arg !== '--inventory');
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(' ')}\n${USAGE}`);
  process.exit(2);
}

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
if (args.includes('--inventory')) {
  console.log(JSON.stringify(inventoryCodeExamples(docsRoot), null, 2));
  process.exit(0);
}
const files = listCodeExampleFiles(docsRoot);
const violations = checkCodeExamples(files, { requireApi: true });
const counts: Record<string, number> = {};
for (const violation of violations) counts[violation.rule] = (counts[violation.rule] ?? 0) + 1;

if (args.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, violations, counts }, null, 2));
} else if (violations.length) {
  for (const { path, line, rule, message } of violations) console.log(`${path}:${line} ${rule} ${message}`);
  const fileCount = new Set(violations.map((violation) => violation.path)).size;
  console.log(`\n${violations.length} code example violation(s) in ${fileCount} of ${files.length} file(s):`);
  for (const rule of Object.keys(counts).sort()) console.log(`  ${rule}: ${counts[rule]}`);
} else {
  console.log(`No code example violations in ${files.length} file(s).`);
}

process.exit(violations.length ? 1 : 0);
