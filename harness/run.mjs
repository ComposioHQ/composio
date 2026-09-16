#!/usr/bin/env node
// Examples runner: sweeps the entrypoints in examples-manifest.json against
// the live backend, recording per-entry results and Composio traces.
//
//   node harness/run.mjs sweep    --client baseline|candidate [--lang ts|py] [--ids a,b] [--tiers 1,2,3] [--llm live|mock]
//   node harness/run.mjs neg      [--lang ts|py] [--ids a,b] [--sample N] [--seed S]
//   node harness/run.mjs selftest
//
// Exit codes: 0 ok · 1 findings (red entries / failed expectations) · 2 usage/env error.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBackendBaseUrl, STAGING_BASE_URL } from './backend-url.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = join(ROOT, '.artifacts', 'examples-parity');
const STAINLESS_TS_VERSION = '0.1.0-alpha.76';
const AIMOCK_VERSION = '1.38.0';
const AIMOCK_PORT = Number(process.env.AIMOCK_PORT ?? 4010);

// Set by cmdSweep when --llm mock: LLM traffic goes to a local aimock server
// and provider keys are overridden so a mock sweep can never spend tokens.
let LLM_MOCK = false;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

class HarnessError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fail = (msg, code = 2) => {
  throw new HarnessError(msg, code);
};

const loadManifest = () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'examples-manifest.json'), 'utf8'));
  for (const e of manifest.entries) {
    if (!e.id || !e.lang || !e.file || !e.tier) fail(`manifest entry missing required fields: ${JSON.stringify(e)}`);
    if (e.lang === 'ts' && e.tier !== 'X' && !e.pkg) fail(`ts entry ${e.id} missing pkg`);
    if (e.tier === '3' && !e.readiness) fail(`tier-3 entry ${e.id} missing readiness regex`);
  }
  return manifest.entries;
};

const selectEntries = () => {
  const lang = opt('lang');
  const ids = opt('ids') ? opt('ids').split(',') : null;
  const tiers = (opt('tiers', '1,2,3')).split(',');
  return loadManifest().filter(
    (e) =>
      e.tier !== 'X' &&
      tiers.includes(e.tier) &&
      (!lang || e.lang === lang) &&
      (!ids || ids.includes(e.id))
  );
};

const baseUrl = () => {
  try {
    return resolveBackendBaseUrl();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
};

// Deterministic PRNG so --seed reproduces a negative-control sample.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const runId = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 8);

/** Spawn one entry; resolve {exit, readinessMatched, timedOut, durationMs}. */
const runEntry = (entry, env, { garbage = false } = {}) =>
  new Promise((resolveRun) => {
    const isTs = entry.lang === 'ts';
    let cmdline;
    if (isTs && entry.script) {
      cmdline = ['pnpm', '--filter', entry.pkg, 'run', entry.script];
    } else if (isTs) {
      // pnpm --filter runs with the example package as cwd; derive the package
      // dir from the entry file path (ts/examples/<dir>/src/...).
      const pkgDir = entry.file.split('/').slice(0, 3).join('/');
      const srcRel = relative(join(ROOT, pkgDir), join(ROOT, entry.file));
      cmdline = ['pnpm', '--filter', entry.pkg, 'exec', 'tsx', srcRel];
    } else {
      cmdline = ['uv', 'run', '--project', 'python'];
      for (const dep of entry.pyWith ?? []) cmdline.push('--with', dep);
      cmdline.push('python', join(ROOT, entry.file));
    }

    const child = spawn(cmdline[0], cmdline.slice(1), {
      cwd: ROOT,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const started = Date.now();
    const timeoutMs = (entry.timeoutSec ?? 120) * 1000;
    let readinessMatched = false;
    let timedOut = false;
    let settled = false;
    let outputTail = '';
    const readiness = entry.tier === '3' && entry.readiness ? new RegExp(entry.readiness) : null;

    const killTree = () => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, 10_000).unref();
    };

    const onChunk = (chunk) => {
      const text = chunk.toString();
      outputTail = (outputTail + text).slice(-4000);
      if (readiness && !readinessMatched && readiness.test(outputTail)) {
        readinessMatched = true;
        // Grace period so the in-flight backend call lands in the trace, then stop the listener.
        setTimeout(killTree, 3000).unref();
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        exit: code ?? (signal ? 128 : 1),
        readinessMatched,
        timedOut,
        durationMs: Date.now() - started,
        outputTail: garbage ? undefined : outputTail.slice(-1500),
      });
    });
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ exit: 127, readinessMatched: false, timedOut: false, durationMs: Date.now() - started });
    });
  });

const isGreen = (entry, r) => {
  if (entry.tier === '3') return r.readinessMatched || (!r.timedOut && r.exit === 0);
  return !r.timedOut && r.exit === 0;
};

const buildEnv = (entry, runDir, { garbage = false } = {}) => {
  const traceFile = join(runDir, 'traces', `${entry.id.replace(/[/]/g, '__')}.jsonl`);
  mkdirSync(dirname(traceFile), { recursive: true });
  const env = { ...process.env };
  env.COMPOSIO_BASE_URL = baseUrl();
  env.COMPOSIO_TRACE_FILE = traceFile;
  env.COMPOSIO_LOG_LEVEL ??= 'error';
  // The outbound-email denylist is fixed by the shims; never overridable per run.
  delete env.COMPOSIO_TOOL_DENYLIST;
  if (entry.lang === 'ts') {
    env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --import=file://${join(ROOT, 'harness', 'trace', 'register.mjs')}`.trim();
  } else {
    env.PYTHONPATH = `${join(ROOT, 'harness', 'trace-py')}${env.PYTHONPATH ? `:${env.PYTHONPATH}` : ''}`;
  }
  if (garbage) {
    env.COMPOSIO_API_KEY = 'nc-invalid-0000000000000000';
    env.OPENAI_API_KEY = 'nc-invalid';
    env.ANTHROPIC_API_KEY = 'nc-invalid';
    env.GEMINI_API_KEY = 'nc-invalid';
    env.NOTION_API_KEY = 'nc-invalid';
  } else if (LLM_MOCK) {
    const mock = `http://127.0.0.1:${AIMOCK_PORT}`;
    env.OPENAI_BASE_URL = `${mock}/v1`;
    // langchain/litellm read the older variable name.
    env.OPENAI_API_BASE = `${mock}/v1`;
    env.ANTHROPIC_BASE_URL = mock;
    env.OPENAI_API_KEY = 'aimock';
    env.ANTHROPIC_API_KEY = 'aimock';
  }
  return { env, traceFile };
};

const LLM_KEYS = new Set(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']);

const missingEnv = (entry) => {
  const wanted = [...(entry.env ?? []), ...(entry.ids ?? [])].filter(
    (k) => !(LLM_MOCK && LLM_KEYS.has(k))
  );
  if (entry.backend !== false) wanted.unshift('COMPOSIO_API_KEY');
  return wanted.filter((k) => !process.env[k]);
};

/** Run entries with bounded concurrency; serial entries run last, alone. */
const runPool = async (entries, runDir, { garbage = false, concurrency = 4 } = {}) => {
  const parallel = entries.filter((e) => !e.serial);
  const serial = entries.filter((e) => e.serial);
  const results = [];
  const worker = async (queue) => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      if (LLM_MOCK && entry.llmMock === false) {
        results.push({ id: entry.id, tier: entry.tier, status: 'skipped', reason: 'llm-mock-unsupported' });
        console.log(`  ~ ${entry.id} skipped (llm-mock-unsupported)`);
        continue;
      }
      const missing = garbage ? [] : missingEnv(entry);
      if (missing.length > 0) {
        results.push({ id: entry.id, tier: entry.tier, status: 'skipped', reason: `missing-env:${missing.join(',')}` });
        console.log(`  ~ ${entry.id} skipped (${missing.join(',')})`);
        continue;
      }
      const { env, traceFile } = buildEnv(entry, runDir, { garbage });
      const r = await runEntry(entry, env, { garbage });
      // An entry that tripped the outbound-email guard is red no matter how it
      // exited: catching the refusal and continuing is not coverage.
      const blocked =
        existsSync(traceFile) && readFileSync(traceFile, 'utf8').includes('"s":"BLOCKED"');
      const green = !blocked && isGreen(entry, r);
      results.push({
        id: entry.id,
        tier: entry.tier,
        status: green ? 'green' : 'red',
        ...(blocked ? { reason: 'blocked-tool' } : {}),
        exit: r.exit,
        timedOut: r.timedOut,
        readinessMatched: r.readinessMatched,
        durationMs: r.durationMs,
        traceFile: relative(ROOT, traceFile),
        outputTail: green ? undefined : r.outputTail,
      });
      console.log(`  ${green ? '✓' : '✗'} ${entry.id} (${(r.durationMs / 1000).toFixed(1)}s${r.timedOut ? ', timeout' : ''})`);
    }
  };
  const queue = [...parallel];
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, () => worker(queue)));
  for (const entry of serial) await worker([entry]);
  return results;
};

// --- candidate swap (TS) --------------------------------------------------

const WORKSPACE_YAML = join(ROOT, 'pnpm-workspace.yaml');
const LOCKFILE = join(ROOT, 'pnpm-lock.yaml');

const sh = (cmdline, opts = {}) =>
  new Promise((resolveSh, rejectSh) => {
    const child = spawn(cmdline[0], cmdline.slice(1), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('exit', (code) => (code === 0 ? resolveSh(out) : rejectSh(new Error(`${cmdline.join(' ')} → exit ${code}\n${out.slice(-2000)}`))));
  });

const resolvedTsClientVersion = async () => {
  const out = await sh(['node', '-e', "console.log(JSON.parse(require('fs').readFileSync(require.resolve('@composio/client/package.json', {paths:[require('path').join(process.cwd(),'ts/packages/core')]}), 'utf8')).version)"]);
  return out.trim().split('\n').pop();
};

const applyTsCandidate = async (tarball) => {
  if (!existsSync(tarball)) fail(`COMPOSIO_CLIENT_TARBALL not found: ${tarball}`);
  const yaml = readFileSync(WORKSPACE_YAML, 'utf8');
  if (/^overrides:$/m.test(yaml)) {
    // Merge into the repo's existing overrides block (e.g. security pins);
    // restoreTsBaseline() writes back the exact pre-run snapshot either way.
    writeFileSync(WORKSPACE_YAML, yaml.replace(/^overrides:$/m, `overrides:\n  '@composio/client': file:${tarball}`));
  } else {
    writeFileSync(WORKSPACE_YAML, `${yaml}\noverrides:\n  '@composio/client': file:${tarball}\n`);
  }
  await sh(['pnpm', 'install', '--no-frozen-lockfile']);
  const version = await resolvedTsClientVersion();
  if (version === STAINLESS_TS_VERSION) {
    fail(`override did not take effect: @composio/client still resolves to ${version}`);
  }
  console.log(`candidate @composio/client resolved: ${version}`);
  await sh(['pnpm', 'run', 'build:packages']);
};

const snapshotFiles = (paths) => new Map(paths.map((path) => [path, readFileSync(path)]));

const restoreFiles = (snapshot) => {
  for (const [path, contents] of snapshot) writeFileSync(path, contents);
};

const snapshotTsBaseline = () => snapshotFiles([WORKSPACE_YAML, LOCKFILE]);

const restoreTsBaseline = async (snapshot) => {
  restoreFiles(snapshot);
  await sh(['pnpm', 'install', '--frozen-lockfile']);
};

const verifyPyCandidate = async (wheel) => {
  if (!existsSync(wheel)) fail(`COMPOSIO_CLIENT_WHEEL not found: ${wheel}`);
  const out = await sh(['uv', 'run', '--project', 'python', '--with', wheel, 'python', '-c', 'import composio_client, importlib.metadata; print(importlib.metadata.version("composio-client"))']);
  const version = out.trim().split('\n').pop();
  if (!version.startsWith('2.')) {
    fail(`python candidate did not take effect (resolved ${version}); Stage B (SDK migration) must land first`);
  }
  return version;
};

const PY_PROJECT = join(ROOT, 'python', 'pyproject.toml');
const UV_LOCK = join(ROOT, 'uv.lock');
const PY_CLIENT_PIN = /^(\s*)"composio-client==[^"]+",$/m;

/**
 * Drop the exact `composio-client==` pin from the python project.
 *
 * A candidate sweep layers the wheel onto every entry with `uv run --with`, but
 * several entries also install the local `./python` project, whose exact pin the
 * wheel contradicts — uv then refuses the whole overlay ("no solution found")
 * and those entries go red for a packaging reason rather than a client one.
 * Without the pin the wheel is the only `composio-client` in play. Baseline
 * sweeps never call this, and restorePyBaseline() writes the pre-run files back
 * either way.
 */
const relaxPyClientPin = (toml) => {
  if (!PY_CLIENT_PIN.test(toml)) {
    fail(`no exact composio-client pin found in ${relative(ROOT, PY_PROJECT)}`);
  }
  return toml.replace(PY_CLIENT_PIN, '$1"composio-client",');
};

const snapshotPyBaseline = () => snapshotFiles([PY_PROJECT, UV_LOCK]);

const restorePyBaseline = async (snapshot) => {
  restoreFiles(snapshot);
  await sh(['uv', 'sync', '--project', 'python', '--frozen']);
};

// --- llm mock ---------------------------------------------------------------

/** Start aimock serving harness/llm-mock/fixtures; resolve once it answers. */
const startLlmMock = async (runDir) => {
  const mockDir = join(ROOT, 'harness', 'llm-mock');
  const logFile = join(runDir, 'aimock.log');
  const child = spawn(
    'npx',
    ['-y', `@copilotkit/aimock@${AIMOCK_VERSION}`, '-c', 'aimock.json', '-p', String(AIMOCK_PORT), '-h', '127.0.0.1'],
    { cwd: mockDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.on('data', (c) => appendFileSync(logFile, c));
  child.stderr.on('data', (c) => appendFileSync(logFile, c));

  // First run may download the package; allow a generous readiness window.
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${AIMOCK_PORT}/v1/models`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
      fail(`aimock did not become ready on :${AIMOCK_PORT} (see ${relative(ROOT, logFile)})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`aimock ${AIMOCK_VERSION} ready on :${AIMOCK_PORT}`);
  return () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
  };
};

// --- commands ---------------------------------------------------------------

const cmdSweep = async () => {
  const client = opt('client', 'baseline');
  if (!['baseline', 'candidate'].includes(client)) fail(`--client must be baseline|candidate`);
  const llm = opt('llm', 'live');
  if (!['live', 'mock'].includes(llm)) fail(`--llm must be live|mock`);
  LLM_MOCK = llm === 'mock';
  const entries = selectEntries();
  if (entries.length === 0) fail('no entries selected');
  if (!process.env.COMPOSIO_API_KEY) fail('COMPOSIO_API_KEY is required for a sweep (disposable examples-project key)', 2);

  const id = `${runId()}-${client}${LLM_MOCK ? '-mock' : ''}`;
  const runDir = join(ARTIFACTS, id);
  mkdirSync(join(runDir, 'traces'), { recursive: true });

  let tsBaselineSnapshot;
  let pyBaselineSnapshot;
  let stopLlmMock;
  const pyWheel = process.env.COMPOSIO_CLIENT_WHEEL;
  try {
    if (LLM_MOCK) stopLlmMock = await startLlmMock(runDir);
    if (client === 'candidate') {
      const wantTs = entries.some((e) => e.lang === 'ts');
      const wantPy = entries.some((e) => e.lang === 'py');
      if (wantTs) {
        if (!process.env.COMPOSIO_CLIENT_TARBALL) fail('candidate sweep with ts entries needs COMPOSIO_CLIENT_TARBALL');
        tsBaselineSnapshot = snapshotTsBaseline();
        await applyTsCandidate(process.env.COMPOSIO_CLIENT_TARBALL);
      }
      if (wantPy) {
        if (!pyWheel) fail('candidate sweep with py entries needs COMPOSIO_CLIENT_WHEEL');
        const v = await verifyPyCandidate(pyWheel);
        console.log(`candidate composio-client (py) resolved: ${v}`);
        pyBaselineSnapshot = snapshotPyBaseline();
        writeFileSync(PY_PROJECT, relaxPyClientPin(readFileSync(PY_PROJECT, 'utf8')));
        for (const e of entries) if (e.lang === 'py') e.pyWith = [...(e.pyWith ?? []), pyWheel];
      }
    }

    console.log(`sweep ${id}: ${entries.length} entries → ${runDir}`);
    const results = await runPool(entries, runDir, { concurrency: Number(opt('concurrency', '4')) });
    for (const r of results) appendFileSync(join(runDir, 'results.jsonl'), `${JSON.stringify(r)}\n`);
    const counts = {
      green: results.filter((r) => r.status === 'green').length,
      red: results.filter((r) => r.status === 'red').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };
    writeFileSync(
      join(runDir, 'summary.json'),
      JSON.stringify({ runId: id, client, llm, baseUrl: baseUrl(), counts, startedAt: new Date().toISOString() }, null, 2)
    );
    console.log(`sweep ${id}: ${counts.green} green / ${counts.red} red / ${counts.skipped} skipped`);
    process.exitCode = counts.red > 0 ? 1 : 0;
  } finally {
    if (stopLlmMock) stopLlmMock();
    if (tsBaselineSnapshot) await restoreTsBaseline(tsBaselineSnapshot);
    if (pyBaselineSnapshot) await restorePyBaseline(pyBaselineSnapshot);
  }
};

const cmdNeg = async () => {
  let entries = selectEntries().filter((e) => e.backend !== false);
  const sample = opt('sample');
  if (sample) {
    const rand = mulberry32(Number(opt('seed', '42')));
    entries = [...entries].sort(() => rand() - 0.5).slice(0, Number(sample));
  }
  const id = `${runId()}-neg`;
  const runDir = join(ARTIFACTS, id);
  mkdirSync(join(runDir, 'traces'), { recursive: true });
  console.log(`negative controls ${id}: ${entries.length} entries (garbage credentials; expectation: red)`);
  const results = await runPool(entries, runDir, { garbage: true, concurrency: Number(opt('concurrency', '6')) });
  const swallowers = results.filter((r) => r.status === 'green').map((r) => r.id);
  for (const r of results) appendFileSync(join(runDir, 'results.jsonl'), `${JSON.stringify(r)}\n`);
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ runId: id, mode: 'neg', total: results.length, swallowers }, null, 2));
  if (swallowers.length > 0) {
    console.log(`NEGATIVE-CONTROL FAILURES (green under garbage credentials — these swallow errors):`);
    for (const s of swallowers) console.log(`  ✗ ${s}`);
    process.exitCode = 1;
  } else {
    console.log('all negative controls red, as expected');
  }
};

const cmdSelftest = async () => {
  const runDir = join(ARTIFACTS, `${runId()}-selftest`);
  mkdirSync(join(runDir, 'traces'), { recursive: true });
  let failures = 0;
  const check = (name, ok) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failures += 1;
  };

  // 0. backend URL: staging is the default, any other bare https root is
  //    honoured as given, and anything structurally unusable is refused.
  check('staging backend is the default', resolveBackendBaseUrl(undefined) === STAGING_BASE_URL);
  check(
    'a non-staging bare https root is honoured',
    resolveBackendBaseUrl('https://backend.composio.dev') === 'https://backend.composio.dev'
  );
  const refuses = (value) => {
    try {
      resolveBackendBaseUrl(value);
      return false;
    } catch {
      return true;
    }
  };
  check('a base URL carrying a path is refused', refuses('https://backend.composio.dev/api/v3'));
  check('a base URL carrying a query is refused', refuses('https://backend.composio.dev/?x=1'));
  check(
    'a base URL carrying credentials is refused',
    refuses('https://user:pass@backend.composio.dev')
  );
  check('a plaintext base URL is refused', refuses('http://backend.composio.dev'));
  check('an unparseable base URL is refused', refuses('not-a-url'));

  let cleanupRan = false;
  let cleanupError;
  try {
    try {
      fail('expected selftest failure');
    } finally {
      cleanupRan = true;
    }
  } catch (error) {
    cleanupError = error;
  }
  check(
    'usage failures unwind through cleanup',
    cleanupRan && cleanupError instanceof HarnessError
  );

  const cleanupFixture = join(runDir, 'cleanup-fixture.txt');
  writeFileSync(cleanupFixture, 'user contents');
  const cleanupSnapshot = snapshotFiles([cleanupFixture]);
  writeFileSync(cleanupFixture, 'candidate contents');
  restoreFiles(cleanupSnapshot);
  check('cleanup restores pre-run file contents', readFileSync(cleanupFixture, 'utf8') === 'user contents');

  // The python candidate swap only resolves once the project's exact
  // composio-client pin is out of the way; see relaxPyClientPin.
  const pinnedProject = readFileSync(PY_PROJECT, 'utf8');
  const relaxedProject = relaxPyClientPin(pinnedProject);
  check('the python project pins composio-client exactly', /"composio-client==/.test(pinnedProject));
  check(
    'relaxing the pin keeps composio-client a dependency',
    /^\s*"composio-client",$/m.test(relaxedProject) && !/"composio-client==/.test(relaxedProject)
  );
  check(
    'relaxing the pin touches nothing else',
    relaxedProject.replace(/^\s*"composio-client",$/m, '') ===
      pinnedProject.replace(/^\s*"composio-client==[^"]+",$/m, '')
  );
  let unpinnedProjectRejected = false;
  try {
    relaxPyClientPin(relaxedProject);
  } catch {
    unpinnedProjectRejected = true;
  }
  check('relaxing an already-unpinned project is refused', unpinnedProjectRejected);

  // 1. known-good: error-handling-demo (no backend, no keys).
  const good = loadManifest().find((e) => e.id === 'ts/error-handling-demo/index');
  const { env: goodEnv } = buildEnv(good, runDir);
  delete goodEnv.COMPOSIO_API_KEY;
  const goodRes = await runEntry(good, goodEnv);
  check('known-good (error-handling-demo) exits 0', goodRes.exit === 0);

  // 2. known-bad fixtures: must exit non-zero in both languages.
  const badTsOut = await sh(['pnpm', 'exec', 'tsx', 'harness/fixtures/always-fails.ts']).then(() => 0).catch(() => 1);
  check('known-bad ts fixture exits non-zero', badTsOut === 1);
  const badPy = await sh(['uv', 'run', '--project', 'python', 'python', 'harness/fixtures/always_fails.py']).then(() => 0).catch(() => 1);
  check('known-bad py fixture exits non-zero', badPy === 1);

  // 3. trace shims: an unauthenticated backend request must appear in the trace.
  const tsTrace = join(runDir, 'traces', 'shim-ts.jsonl');
  await sh(['pnpm', 'exec', 'tsx', 'harness/fixtures/trace-check.ts'], {
    env: { ...process.env, COMPOSIO_TRACE_FILE: tsTrace, COMPOSIO_BASE_URL: baseUrl(), NODE_OPTIONS: `--import=file://${join(ROOT, 'harness', 'trace', 'register.mjs')}` },
  }).catch(() => {});
  const tsLines = existsSync(tsTrace) ? readFileSync(tsTrace, 'utf8').trim().split('\n').filter(Boolean) : [];
  check('ts fetch shim recorded a composio call', tsLines.some((l) => JSON.parse(l).p?.includes('/api/')));

  const pyTrace = join(runDir, 'traces', 'shim-py.jsonl');
  await sh(['uv', 'run', '--project', 'python', 'python', 'harness/fixtures/trace_check.py'], {
    env: { ...process.env, COMPOSIO_TRACE_FILE: pyTrace, COMPOSIO_BASE_URL: baseUrl(), PYTHONPATH: join(ROOT, 'harness', 'trace-py') },
  }).catch(() => {});
  const pyLines = existsSync(pyTrace) ? readFileSync(pyTrace, 'utf8').trim().split('\n').filter(Boolean) : [];
  check('py httpx shim recorded a composio call', pyLines.some((l) => JSON.parse(l).p?.includes('/api/')));

  // 4. parity must compare at least one entry and reject missing candidates.
  const parityBase = join(runDir, 'parity-base');
  const parityCandidate = join(runDir, 'parity-candidate');
  for (const dir of [parityBase, parityCandidate]) {
    mkdirSync(join(dir, 'traces'), { recursive: true });
    writeFileSync(join(dir, 'results.jsonl'), `${JSON.stringify({ id: 'fixture', status: 'green' })}\n`);
    writeFileSync(
      join(dir, 'traces', 'fixture.jsonl'),
      `${JSON.stringify({ m: 'GET', p: '/api/v3/toolkits', s: '2xx' })}\n`
    );
  }
  const parityMatches = await sh(['node', 'harness/parity.mjs', parityBase, parityCandidate])
    .then(() => true)
    .catch(() => false);
  check('parity accepts matching runs', parityMatches);
  writeFileSync(join(parityCandidate, 'results.jsonl'), '');
  const missingCandidateRejected = await sh(['node', 'harness/parity.mjs', parityBase, parityCandidate])
    .then(() => false)
    .catch(() => true);
  check('parity rejects missing candidate entries', missingCandidateRejected);

  rmSync(runDir, { recursive: true, force: true });
  console.log(failures === 0 ? 'selftest: PASS' : `selftest: FAIL (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
};

try {
  switch (cmd) {
    case 'sweep':
      await cmdSweep();
      break;
    case 'neg':
      await cmdNeg();
      break;
    case 'selftest':
      await cmdSelftest();
      break;
    default:
      fail('usage: run.mjs <sweep|neg|selftest> [options]');
  }
} catch (error) {
  console.error(`run.mjs: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = error instanceof HarnessError ? error.exitCode : 1;
}
