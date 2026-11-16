/**
 * Live, repeated journey runs: the measurement a skill change is judged by.
 *
 *   bun run eval.ts run --model claude-haiku-5-5 [options]
 *   bun run eval.ts report <batch>
 *   bun run eval.ts compare <baseline batch> <candidate batch> [--arm skill]
 *   bun run eval.ts keep <batch> <decision-name>
 *
 * A batch is named by its id under `results/`, or by the path of a batch
 * directory kept in the repository (see `evals/`).
 *
 * `run` options:
 *   --agent claude-code|loop   Claude Code with the skill installed (default), or
 *                              the minimal loop with the skill as system prompt
 *   --runs <k>                 runs per journey and arm (default 3)
 *   --arms skill,no-skill      which arms to run (default skill)
 *   --split train|holdout|all  which journeys (default all)
 *   --journeys <id,id>         exactly these journeys
 *   --max-cost-usd <usd>       stop starting runs once this much is spent (default 2)
 *   --run-budget-usd <usd>     Claude Code stops a single run at this cost (default 0.5)
 *   --concurrency <n>          runs at once (default 2)
 *   --label <name>             appended to the batch id
 *   --force                    run everything, reusing no earlier run
 *   --dry                      print the plan; start nothing, spend nothing
 *   --smoke                    one journey, one run, to check the setup
 *
 * The API key is read from ANTHROPIC_API_KEY and stays in this process: the
 * agent reaches the model through `src/model-proxy.ts`. Results go to
 * `results/<batch>/` (git-ignored). See HILLCLIMB.md for how to use them.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startJourneyContainer } from '@e2e-tests/utils';
import { z } from 'zod';
import { anthropicAdapter } from './src/anthropic-adapter';
import {
  AGENTS,
  ARMS,
  fingerprint,
  previousRuns,
  readBatch,
  renderComparison,
  renderSummary,
  treeHash,
  type AgentName,
  type Arm,
  type BatchInfo,
  type RunRecord,
} from './src/batch';
import { CLAUDE_CODE_VERSION, claudeCodeDriver, ensureClaudeCodeBinary } from './src/claude-code';
import { MAX_OUTPUT_TOKENS } from './src/adapters';
import { JOURNEYS, type Journey, type JourneyRun } from './src/journeys';
import { ALLOWED_MODELS, startModelProxy, type ModelProxy } from './src/model-proxy';
import { loopDriver, runJourneyWith, type Driver } from './src/run-journey';
import { buildSkill } from './src/skill';

const HERE = import.meta.dir;
const RESULTS = join(HERE, 'results');
const REPO_TS = resolve(HERE, '..', '..', '..');
/**
 * What drives and grades a run: the journeys and their checks, the person,
 * the agents, and the fake backend. A change here makes earlier results
 * incomparable. The reporting code (`batch.ts`, `metrics.ts`) is left out.
 */
const HARNESS_PATHS = [
  'e2e-tests/cli/fake-backend/src',
  ...[
    'agent.ts',
    'anthropic-adapter.ts',
    'claude-code.ts',
    'journeys.ts',
    'person.ts',
    'run-journey.ts',
    'scrub.ts',
    'skill.ts',
  ].map(file => `e2e-tests/cli/agent-journeys/src/${file}`),
];
/** Wall-clock limit for one run's agent. */
const RUN_DEADLINE_MS = 6 * 60_000;
/** Shell commands one run may start. The longest recorded run used eleven. */
const MAX_COMMANDS = 40;

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: HERE, encoding: 'utf8' }).trim();

/** A batch id under `results/`, or the path of a batch directory kept elsewhere (`evals/`). */
const batchDirectory = (name: string): string =>
  existsSync(join(name, 'batch.json')) ? resolve(name) : resolve(RESULTS, name);

const [command, ...rest] = process.argv.slice(2);

if (command === 'report') {
  const [batch] = rest;
  if (!batch) fail('Usage: bun run eval.ts report <batch>');
  const { info, runs } = readBatch(batchDirectory(batch!));
  process.stdout.write(renderSummary(info, runs));
  process.exit(0);
}

if (command === 'keep') {
  const [batch, decision] = rest;
  if (!batch || !decision || !/^[a-z0-9][a-z0-9-]*$/.test(decision)) {
    fail('Usage: bun run eval.ts keep <batch> <decision-name>');
  }
  const source = batchDirectory(batch!);
  const { info } = readBatch(source);
  const target = join(HERE, 'evals', decision!, info.id);
  mkdirSync(target, { recursive: true });
  // The records and the summary, not the logs: they are large and hold every command's output.
  for (const name of ['batch.json', 'runs.jsonl', 'summary.md']) {
    const text = readFileSync(join(source, name), 'utf8');
    if (/sk-ant-|sk-journey-/.test(text)) fail(`${name} holds a key or a proxy token; not kept.`);
    writeFileSync(join(target, name), text);
  }
  console.log(`kept      ${relative(process.cwd(), target)}`);
  process.exit(0);
}

if (command === 'compare') {
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      arm: { type: 'string', default: 'skill' },
      'allow-harness-change': { type: 'boolean', default: false },
    },
  });
  const [baseline, candidate] = positionals;
  const arm = z.enum(ARMS).safeParse(values.arm);
  if (!baseline || !candidate || !arm.success) {
    fail(
      'Usage: bun run eval.ts compare <baseline batch> <candidate batch> [--arm skill|no-skill]'
    );
  }
  process.stdout.write(
    renderComparison(readBatch(batchDirectory(baseline!)), readBatch(batchDirectory(candidate!)), {
      arm: arm.data!,
      allowHarnessChange: values['allow-harness-change'] ?? false,
    })
  );
  process.exit(0);
}

if (command !== 'run') {
  fail('Usage: bun run eval.ts run|report|compare|keep … (see the header of eval.ts)');
}

const { values } = parseArgs({
  args: rest,
  options: {
    model: { type: 'string' },
    agent: { type: 'string', default: 'claude-code' },
    runs: { type: 'string', default: '3' },
    arms: { type: 'string', default: 'skill' },
    split: { type: 'string', default: 'all' },
    journeys: { type: 'string' },
    'max-cost-usd': { type: 'string', default: '2' },
    'run-budget-usd': { type: 'string', default: '0.5' },
    concurrency: { type: 'string', default: '2' },
    label: { type: 'string' },
    force: { type: 'boolean', default: false },
    dry: { type: 'boolean', default: false },
    smoke: { type: 'boolean', default: false },
  },
});

const Options = z.object({
  model: z.enum(ALLOWED_MODELS),
  agent: z.enum(AGENTS),
  runs: z.coerce.number().int().min(1).max(20),
  arms: z.array(z.enum(ARMS)).min(1),
  split: z.enum(['train', 'holdout', 'all']),
  maxCostUsd: z.coerce.number().positive(),
  runBudgetUsd: z.coerce.number().positive(),
  concurrency: z.coerce.number().int().min(1).max(8),
  label: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .optional(),
});
const parsed = Options.safeParse({
  model: values.model,
  agent: values.agent,
  runs: values.smoke ? '1' : values.runs,
  arms: values.arms?.split(',').map(arm => arm.trim()),
  split: values.split,
  maxCostUsd: values['max-cost-usd'],
  runBudgetUsd: values['run-budget-usd'],
  concurrency: values.concurrency,
  label: values.label,
});
if (!parsed.success) {
  fail(`${z.prettifyError(parsed.error)}\n\nModels: ${ALLOWED_MODELS.join(', ')}`);
}
const options = parsed.data!;

const named = values.journeys?.split(',').map(id => id.trim());
const unknown = named?.filter(id => !JOURNEYS.some(journey => journey.id === id)) ?? [];
if (unknown.length > 0) fail(`Unknown journeys: ${unknown.join(', ')}`);
let journeys: ReadonlyArray<Journey> = JOURNEYS.filter(
  journey =>
    (named === undefined || named.includes(journey.id)) &&
    (options.split === 'all' || journey.split === options.split)
);
if (values.smoke) journeys = journeys.slice(0, 1);
if (journeys.length === 0) fail('No journey matches.');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !values.dry) fail('ANTHROPIC_API_KEY is not set; nothing was started.');

// What the batch measures. The CLI is the binary a journey container would
// run now: starting one builds the image when the checkout changed. The
// binary is hashed, not the image, which also holds the test sources.
const probe = await startJourneyContainer({ label: 'eval-probe' });
const binaries = await probe.exec('cd /usr/local/bin && sha256sum composio *.mjs | sha256sum', {
  cwd: '/',
});
await probe.stop();
if (binaries.exitCode !== 0) fail(`Could not hash the CLI binary: ${binaries.stderr}`);
const cliSha256 = binaries.stdout.split(' ')[0]!.trim();

const agentVersion = options.agent === 'claude-code' ? CLAUDE_CODE_VERSION : 'loop';
const skillSha256 = createHash('sha256').update(JSON.stringify(buildSkill())).digest('hex');
const harnessSha256 = treeHash(REPO_TS, HARNESS_PATHS);
const startedAt = new Date();
const batchId = `${startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${options.agent}-${options.model}${options.label ? `-${options.label}` : ''}`;
const info: BatchInfo = {
  id: batchId,
  startedAt: startedAt.toISOString(),
  agent: options.agent,
  agentVersion,
  model: options.model,
  runs: options.runs,
  arms: options.arms,
  journeys: journeys.map(journey => journey.id),
  revision: git('rev-parse', '--short', 'HEAD'),
  dirty: git('status', '--porcelain', '--', ':/ts/packages/cli', ':/ts/e2e-tests/cli') !== '',
  skillSha256,
  harnessSha256,
  cliSha256,
  maxCostUsd: options.maxCostUsd,
};

interface Planned {
  readonly journey: Journey;
  readonly arm: Arm;
  readonly attempt: number;
  readonly fingerprint: string;
}

const earlier = values.force ? new Map<string, RunRecord[]>() : previousRuns(RESULTS);
const reused: RunRecord[] = [];
const planned: Planned[] = [];
for (const journey of journeys) {
  for (const arm of options.arms) {
    const print = fingerprint({
      journey: journey.id,
      arm,
      agent: options.agent,
      agentVersion,
      model: options.model,
      skillSha256,
      harnessSha256,
      cliSha256,
    });
    const available = (earlier.get(print) ?? []).slice(-options.runs);
    reused.push(...available.map((run, index) => ({ ...run, attempt: index + 1 })));
    for (let attempt = available.length + 1; attempt <= options.runs; attempt += 1) {
      planned.push({ journey, arm, attempt, fingerprint: print });
    }
  }
}

console.log(`batch     ${batchId}`);
console.log(`agent     ${options.agent} ${agentVersion}, ${options.model}`);
console.log(`journeys  ${journeys.map(journey => `${journey.id} (${journey.split})`).join(', ')}`);
console.log(`arms      ${options.arms.join(', ')}; ${options.runs} run(s) each`);
console.log(
  `runs      ${planned.length} new, ${reused.length} reused; budget $${options.maxCostUsd}`
);
if (values.dry) {
  for (const run of planned)
    console.log(`  would run ${run.journey.id} ${run.arm} #${run.attempt}`);
  process.exit(0);
}

const directory = join(RESULTS, batchId);
mkdirSync(join(directory, 'logs'), { recursive: true });
writeFileSync(join(directory, 'batch.json'), `${JSON.stringify(info, null, 2)}\n`);
const record = (run: RunRecord) =>
  appendFileSync(join(directory, 'runs.jsonl'), `${JSON.stringify(run)}\n`);
for (const run of reused) record(run);

const proxy: ModelProxy = await startModelProxy({ apiKey: apiKey! });
const binary = options.agent === 'claude-code' ? ensureClaudeCodeBinary() : undefined;
let spent = 0;
let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
  console.log('\ninterrupted: finishing the runs in flight, starting no more');
});

/** Nothing that could carry a credential is written. */
const redact = (text: string): string => {
  const cleaned = text.replaceAll(proxy.token, '<proxy-token>');
  if (cleaned.includes(apiKey!) || /sk-ant-/.test(cleaned)) {
    throw new Error('Refusing to write a log that contains an API key.');
  }
  return cleaned;
};

const driverFor = (arm: Arm, budgetUsd: number, onEvent: (event: unknown) => void): Driver =>
  options.agent === 'claude-code'
    ? claudeCodeDriver({
        model: options.model,
        proxy,
        binary: binary!,
        withSkill: arm === 'skill',
        budgetUsd,
        deadlineMs: RUN_DEADLINE_MS,
        maxCommands: MAX_COMMANDS,
        onEvent,
      })
    : loopDriver(
        inputs =>
          anthropicAdapter({
            baseURL: 'https://api.anthropic.com',
            apiKey: apiKey!,
            model: options.model,
            maxTokens: MAX_OUTPUT_TOKENS,
            ...inputs,
          }),
        { skill: arm === 'skill' ? 'system-prompt' : 'none', scrubbed: false }
      );

const runOne = async (plan: Planned): Promise<void> => {
  const name = `${plan.journey.id}.${plan.arm}.${plan.attempt}`;
  const remaining = options.maxCostUsd - spent;
  if (interrupted || remaining <= 0) {
    console.log(`  skipped ${name}: ${interrupted ? 'interrupted' : 'budget spent'}`);
    return;
  }
  const events: unknown[] = [];
  const started = Date.now();
  const refusedBefore = proxy.refused().length;
  let run: JourneyRun | undefined;
  try {
    run = await runJourneyWith(
      plan.journey,
      driverFor(plan.arm, Math.min(options.runBudgetUsd, remaining), event => events.push(event))
    );
    const checks = plan.journey.checks(run);
    const detours = (plan.journey.detours?.(run) ?? []).filter(detour => !detour.ok);
    const stop =
      typeof run.transcript.stop === 'string' ? run.transcript.stop : run.transcript.stop.provider;
    // A harness or provider failure says nothing about the agent.
    const refused = proxy.refused().slice(refusedBefore);
    const infra = stop.startsWith('exited ') || refused.length > 0;
    const costUsd = run.usage?.costUsd ?? 0;
    spent += costUsd;
    const result: RunRecord = {
      journey: plan.journey.id,
      split: plan.journey.split,
      arm: plan.arm,
      attempt: plan.attempt,
      fingerprint: plan.fingerprint,
      outcome: infra ? 'infra' : checks.every(check => check.ok) ? 'passed' : 'failed',
      checks: checks.map(check => ({
        name: check.name,
        ok: check.ok,
        ...(check.ok ? {} : { seen: JSON.stringify(check.seen ?? null).slice(0, 500) }),
      })),
      detours: detours.map(detour => ({
        name: detour.name,
        ok: false,
        seen: JSON.stringify(detour.seen ?? null).slice(0, 500),
      })),
      stop,
      modelTurns: run.transcript.modelTurns,
      commands: run.transcript.commands.map(item => ({
        command: item.command,
        exitCode: item.exitCode,
      })),
      costUsd,
      durationMs: Date.now() - started,
      ...(infra ? { error: `stop: ${stop}; proxy refused: ${refused.join('; ')}` } : {}),
    };
    writeFileSync(
      join(directory, 'logs', `${name}.json`),
      redact(
        JSON.stringify(
          { ...result, transcript: run.transcript, requests: run.requests, events },
          null,
          2
        )
      )
    );
    record(result);
    console.log(
      `  ${result.outcome.padEnd(6)} ${name}  $${costUsd.toFixed(3)}  ${result.commands.length} cmd  ${detours.length} detour(s)`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record({
      journey: plan.journey.id,
      split: plan.journey.split,
      arm: plan.arm,
      attempt: plan.attempt,
      fingerprint: plan.fingerprint,
      outcome: 'infra',
      checks: [],
      detours: [],
      stop: 'error',
      modelTurns: 0,
      commands: [],
      costUsd: 0,
      durationMs: Date.now() - started,
      error: redact(message).slice(0, 1000),
    });
    console.log(`  infra  ${name}  ${message.slice(0, 200)}`);
  } finally {
    await run?.rig.stop();
  }
};

try {
  const queue = [...planned];
  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) await runOne(next);
    })
  );
} finally {
  await proxy.close();
}

const summary = renderSummary(info, readBatch(directory).runs);
writeFileSync(join(directory, 'summary.md'), summary);
process.stdout.write(`\n${summary}`);
console.log(`results   ${directory}`);
