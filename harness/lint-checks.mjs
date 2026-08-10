#!/usr/bin/env node
// Constraint checks for the examples-live-parity goal. Called by lint.sh.
// stdout: "OK" or "VOID" only. Details go to the audit file (argv[2]),
// which lives OUTSIDE the optimizer's read surface.

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_DIR = process.argv[2] ?? join(homedir(), '.composio-goal-audit');
const findings = [];
const advisories = [];

const manifest = JSON.parse(readFileSync(join(ROOT, 'examples-manifest.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(join(ROOT, 'eval', 'baseline-tiers.json'), 'utf8'));
const variance = JSON.parse(readFileSync(join(ROOT, 'parity-variance.json'), 'utf8'));

// 1. Tier monotonicity: coverage only ever grows (X→3→2→1).
const RANK = { 1: 1, 2: 2, 3: 3, X: 4 };
for (const [id, frozenTier] of Object.entries(baseline.tiers)) {
  const entry = manifest.entries.find((e) => e.id === id);
  if (!entry) {
    findings.push(`entry removed from manifest: ${id}`);
    continue;
  }
  if (RANK[entry.tier] > RANK[frozenTier]) {
    findings.push(`tier regression on ${id}: ${frozenTier} → ${entry.tier}`);
  }
}

// 1b. Backend flags are frozen: an entry may never opt out of negative
// controls / trace liveness by flipping backend to false.
for (const [id, isBackend] of Object.entries(baseline.backend ?? {})) {
  const entry = manifest.entries.find((e) => e.id === id);
  if (entry && isBackend && entry.backend === false) {
    findings.push(`backend flag flipped to false on ${id}`);
  }
}

// 1c. Timeout cap and file-gutting guard (vs frozen sizes).
for (const e of manifest.entries) {
  if (e.tier === 'X') continue;
  if ((e.timeoutSec ?? 120) > 600) findings.push(`timeoutSec > 600 on ${e.id}`);
  const frozenBytes = baseline.fileBytes?.[e.id];
  const p = join(ROOT, e.file);
  if (frozenBytes && existsSync(p) && statSync(p).size < frozenBytes * 0.5) {
    findings.push(`entry file shrunk >50% vs baseline: ${e.file}`);
  }
}

// 2. Excluded cap and reason codes.
const X_REASONS = new Set(['stdin-repl', 'external-tunnel', 'worker-module']);
const excluded = manifest.entries.filter((e) => e.tier === 'X');
if (excluded.length > baseline.excludedCap) {
  findings.push(`excluded entries ${excluded.length} > cap ${baseline.excludedCap}`);
}
for (const e of excluded) {
  if (!X_REASONS.has(e.reason)) findings.push(`excluded entry ${e.id} has invalid reason: ${e.reason}`);
}

// 3. Variance allowlist cap.
const varEntries = variance.entries ?? [];
if (varEntries.length > 10) findings.push(`parity-variance entries ${varEntries.length} > cap 10`);
for (const v of varEntries) {
  if (!v.pair || !v.justification || v.justification.length < 20) {
    findings.push(`parity-variance entry lacks pair/justification: ${JSON.stringify(v)}`);
  }
}

// 4. Example source scans.
const PLACEHOLDER = /<auth[-_]config[-_]id>|<external_user_id>|<extern_user_id>|<user[-_]id>/i;
// VOID only when a local URL is wired into client configuration; bare localhost
// mentions (dev-server docs, curl examples) are advisory.
const LOCAL_CLIENT_URL = /(baseURL|base_url|COMPOSIO_BASE_URL)[^\n]{0,80}(localhost|127\.0\.0\.1|0\.0\.0\.0)/;
const LOCAL_URL = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/;
for (const e of manifest.entries) {
  if (e.tier === 'X') continue;
  const file = join(ROOT, e.file);
  if (!existsSync(file)) {
    findings.push(`manifest entry file missing: ${e.file}`);
    continue;
  }
  const src = readFileSync(file, 'utf8');
  if (PLACEHOLDER.test(src)) advisories.push(`placeholder literal still present in ${e.file} (tier ${e.tier})`);
  if (LOCAL_CLIENT_URL.test(src)) findings.push(`local client base URL in ${e.file}`);
  else if (LOCAL_URL.test(src)) advisories.push(`localhost mention (non-client) in ${e.file}`);
  if (src.includes('COMPOSIO_TRACE_FILE')) findings.push(`example touches the trace channel: ${e.file}`);
  // Advisory-only swallow heuristic; the mechanical enforcement is `run.mjs neg`.
  if (e.lang === 'ts') {
    for (const m of src.matchAll(/catch\s*(\([^)]*\))?\s*\{([\s\S]{0,400}?)\}/g)) {
      const body = m[2] ?? '';
      if (/console\.(error|log|warn)/.test(body) && !/throw|process\.exit|exitCode|reject/.test(body)) {
        advisories.push(`possible error swallow in ${e.file}`);
        break;
      }
    }
  } else {
    if (/except\s+\w*Exception\w*[^:]*:\s*\n\s+print\(/.test(src) && !/raise|sys\.exit\(1\)/.test(src)) {
      advisories.push(`possible error swallow in ${e.file}`);
    }
  }
}

// 5. Harness/eval/goal integrity (trust-on-first-use; hashes live in the audit dir).
const hashTargets = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else hashTargets.push(p);
  }
};
walk(join(ROOT, 'harness'));
walk(join(ROOT, 'eval'));
hashTargets.push(join(ROOT, 'goal.md'), join(ROOT, 'spec.md'));
const digest = (p) => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'MISSING');
const current = Object.fromEntries(
  hashTargets.sort().map((p) => [p.replace(`${ROOT}/`, ''), digest(p)])
);
const integrityFile = join(AUDIT_DIR, 'integrity.json');
if (!existsSync(integrityFile)) {
  writeFileSync(integrityFile, JSON.stringify(current, null, 2));
  advisories.push('integrity baseline recorded (first run)');
} else {
  const recorded = JSON.parse(readFileSync(integrityFile, 'utf8'));
  for (const [file, hash] of Object.entries(recorded)) {
    if (current[file] !== hash) findings.push(`read-only file modified: ${file}`);
  }
}

// Report: details to audit dir only; stdout is a single word.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(
  join(AUDIT_DIR, `lint-${stamp}.txt`),
  [`findings (VOID when non-empty):`, ...findings.map((f) => `  - ${f}`), ``, `advisories:`, ...advisories.map((a) => `  - ${a}`)].join('\n')
);
console.log(findings.length > 0 ? 'VOID' : 'OK');
process.exit(findings.length > 0 ? 3 : 0);
