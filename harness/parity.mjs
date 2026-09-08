#!/usr/bin/env node
// Trace-parity comparator: node harness/parity.mjs <baseline-run-dir> <candidate-run-dir>
// Per entry green in BOTH runs: the sets of distinct (method, path-template)
// pairs must be equal, ignoring pairs allowlisted in parity-variance.json.
// Prints a JSON report; exit 0 = all parities hold, 1 = mismatches.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [baseDir, candDir] = process.argv.slice(2);
if (!baseDir || !candDir) {
  console.error('usage: parity.mjs <baseline-run-dir> <candidate-run-dir>');
  process.exit(2);
}

const variance = JSON.parse(readFileSync(join(ROOT, 'parity-variance.json'), 'utf8'));
const ignored = new Set((variance.entries ?? []).map((e) => e.pair));

const loadRun = (dir) => {
  const results = readFileSync(join(dir, 'results.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const byId = new Map();
  for (const r of results) byId.set(r.id, r);
  return byId;
};

const tracePairs = (dir, id) => {
  const file = join(dir, 'traces', `${id.replace(/[/]/g, '__')}.jsonl`);
  const pairs = new Set();
  if (!existsSync(file)) return pairs;
  for (const line of readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)) {
    const rec = JSON.parse(line);
    if (rec.m && rec.p) pairs.add(`${rec.m} ${rec.p}`);
  }
  return pairs;
};

const baseline = loadRun(baseDir);
const candidate = loadRun(candDir);

const report = [];
const ids = new Set([...baseline.keys(), ...candidate.keys()]);
for (const id of [...ids].sort()) {
  const b = baseline.get(id);
  const c = candidate.get(id);
  if (!b || !c) {
    report.push({
      id,
      parity: false,
      reason: `missing ${b ? 'candidate' : 'baseline'} result`,
    });
    continue;
  }
  if (b.status !== 'green' || c.status !== 'green') {
    report.push({ id, parity: false, reason: `status baseline=${b.status} candidate=${c.status}` });
    continue;
  }
  const bp = tracePairs(baseDir, id);
  const cp = tracePairs(candDir, id);
  const onlyBaseline = [...bp].filter((p) => !cp.has(p) && !ignored.has(p));
  const onlyCandidate = [...cp].filter((p) => !bp.has(p) && !ignored.has(p));
  const match = onlyBaseline.length === 0 && onlyCandidate.length === 0;
  report.push({ id, parity: match, ...(match ? {} : { onlyBaseline, onlyCandidate }) });
}

const green = report.filter((r) => r.parity).length;
console.log(JSON.stringify({ compared: report.length, parityGreen: green, ignoredPairs: ignored.size, entries: report }, null, 2));
process.exit(report.length > 0 && report.every((r) => r.parity) ? 0 : 1);
