import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const binary = resolve(dirname(require.resolve('@ast-grep/cli/package.json')), 'ast-grep');

export function scan(cwd = root) {
  // The package keeps a Node shim on Windows; Unix installs may replace it
  // with the native executable. Invoke each in its supported form.
  const command = process.platform === 'win32' ? process.execPath : binary;
  const args = [
    'scan',
    '--config',
    'sgconfig.yml',
    '--json=compact',
    '--error=no-suppress-all',
    '--error=unused-suppression',
  ];
  const result = spawnSync(command, process.platform === 'win32' ? [binary, ...args] : args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  // ast-grep exits 1 for error diagnostics and uses other codes for scan failures.
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`ast-grep failed: ${result.error?.message ?? result.stderr}`);
  }
  const findings = JSON.parse(result.stdout);
  if (!Array.isArray(findings) || (result.status === 1 && findings.length === 0)) {
    throw new Error(`ast-grep did not return valid diagnostics: ${result.stderr}`);
  }
  return findings;
}

function key(entry) {
  return JSON.stringify([entry.ruleId, entry.file, entry.source]);
}

export function inventory(findings) {
  const entries = new Map();
  for (const finding of findings) {
    const entry = {
      ruleId: finding.ruleId,
      file: finding.file.replaceAll('\\', '/'),
      // Include the whole source line for comment-only matches. This binds a
      // Python type-ignore to its statement, rather than to a reusable comment.
      source: finding.lines.replaceAll('\r\n', '\n'),
      count: 1,
    };
    const existing = entries.get(key(entry));
    if (existing) existing.count += 1;
    else entries.set(key(entry), entry);
  }
  return [...entries.values()].sort((a, b) => key(a).localeCompare(key(b), 'en'));
}

export function compare(current, baseline) {
  const allowed = new Map();
  for (const entry of baseline) {
    if (
      typeof entry.ruleId !== 'string' ||
      typeof entry.file !== 'string' ||
      typeof entry.source !== 'string' ||
      !Number.isSafeInteger(entry.count) ||
      entry.count < 1 ||
      allowed.has(key(entry))
    ) {
      throw new Error('Invalid or duplicate anti-slop baseline entry');
    }
    allowed.set(key(entry), entry.count);
  }
  const observed = new Map(current.map(entry => [key(entry), entry.count]));
  return {
    added: current.filter(entry => entry.count > (allowed.get(key(entry)) ?? 0)),
    stale: baseline.filter(entry => entry.count > (observed.get(key(entry)) ?? 0)),
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--prune')) {
    throw new Error('Usage: node scripts/check-antislop.mjs [--prune]');
  }
  const findings = scan();
  const current = inventory(findings);
  const baselinePath = resolve(root, '.ast-grep/baseline.json');
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const { added, stale } = compare(current, baseline);
  for (const entry of added) {
    const finding = findings.find(item => key(inventory([item])[0]) === key(entry));
    console.error(
      `${entry.file}:${finding.range.start.line + 1}: ${entry.ruleId}: ${finding.message}`
    );
    console.error(entry.source);
  }
  if (added.length) {
    console.error('New anti-slop findings. Fix them or justify a rule-specific suppression.');
    process.exitCode = 1;
  } else if (args[0] === '--prune') {
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log('Pruned resolved anti-slop baseline entries. No allowances added.');
  } else if (stale.length) {
    console.error(
      'Resolved anti-slop findings remain in the baseline. Run pnpm lint:antislop:prune.'
    );
    process.exitCode = 1;
  } else {
    console.log(`Anti-slop passed (${findings.length} existing findings; no new findings).`);
  }
}

if (import.meta.main) main();
