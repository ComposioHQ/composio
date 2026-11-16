/**
 * Batches of live runs: what each run recorded, how runs are reused, and the
 * summaries `eval.ts` prints.
 *
 * A batch is a directory under `results/`: `batch.json` says what was
 * measured, `runs.jsonl` has one line per run, `logs/` the full transcripts.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { passAtK, passHatK, wilson } from './metrics';

export const ARMS = ['skill', 'no-skill'] as const;
export type Arm = (typeof ARMS)[number];

export const AGENTS = ['claude-code', 'loop'] as const;
export type AgentName = (typeof AGENTS)[number];

const CheckRecord = z.object({ name: z.string(), ok: z.boolean(), seen: z.string().optional() });

export const RunRecord = z.object({
  journey: z.string(),
  split: z.enum(['train', 'holdout']),
  arm: z.enum(ARMS),
  attempt: z.number(),
  fingerprint: z.string(),
  /**
   * `passed` and `failed` are graded. `infra` means the run says nothing about
   * the agent (the harness or the provider failed) and is left out of every rate.
   */
  outcome: z.enum(['passed', 'failed', 'infra']),
  checks: z.array(CheckRecord),
  /** Detours taken; never a failure, see `Journey.detours`. */
  detours: z.array(CheckRecord),
  stop: z.string(),
  modelTurns: z.number(),
  commands: z.array(z.object({ command: z.string(), exitCode: z.number() })),
  costUsd: z.number(),
  durationMs: z.number(),
  error: z.string().optional(),
  /** Set when the run was copied from an earlier batch with the same fingerprint. */
  reusedFrom: z.string().optional(),
});
export type RunRecord = z.infer<typeof RunRecord>;

export const BatchInfo = z.object({
  id: z.string(),
  startedAt: z.string(),
  agent: z.enum(AGENTS),
  agentVersion: z.string(),
  model: z.string(),
  runs: z.number(),
  arms: z.array(z.enum(ARMS)),
  journeys: z.array(z.string()),
  revision: z.string(),
  /** Uncommitted changes under `ts/packages/cli` or the harness. */
  dirty: z.boolean(),
  skillSha256: z.string(),
  harnessSha256: z.string(),
  /** sha256 of the CLI binary and its companion modules, as the journey container has them. */
  cliSha256: z.string(),
  maxCostUsd: z.number(),
});
export type BatchInfo = z.infer<typeof BatchInfo>;

/** sha256 of the given files and of every file under the given directories, by relative path. */
export const treeHash = (root: string, paths: ReadonlyArray<string>): string => {
  const hash = createHash('sha256');
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name !== 'node_modules') walk(join(path, name));
      }
      return;
    }
    hash
      .update(`${relative(root, path)}\0`)
      .update(readFileSync(path))
      .update('\0');
  };
  for (const path of paths) walk(join(root, path));
  return hash.digest('hex');
};

/**
 * What makes two runs interchangeable: the same journey, under the same
 * graders, with the same CLI, agent, model, and (for the skill arm) skill.
 */
export const fingerprint = (parts: {
  journey: string;
  arm: Arm;
  agent: AgentName;
  agentVersion: string;
  model: string;
  skillSha256: string;
  harnessSha256: string;
  cliSha256: string;
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        ...parts,
        skillSha256: parts.arm === 'skill' ? parts.skillSha256 : 'none',
      })
    )
    .digest('hex')
    .slice(0, 16);

export const readRuns = (batchDirectory: string): RunRecord[] => {
  const path = join(batchDirectory, 'runs.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => RunRecord.parse(JSON.parse(line)));
};

export const readBatch = (batchDirectory: string): { info: BatchInfo; runs: RunRecord[] } => ({
  info: BatchInfo.parse(JSON.parse(readFileSync(join(batchDirectory, 'batch.json'), 'utf8'))),
  runs: readRuns(batchDirectory),
});

/** Graded runs from earlier batches, by fingerprint, oldest first. */
export const previousRuns = (resultsDirectory: string): Map<string, RunRecord[]> => {
  const byFingerprint = new Map<string, RunRecord[]>();
  if (!existsSync(resultsDirectory)) return byFingerprint;
  for (const name of readdirSync(resultsDirectory).sort()) {
    const directory = join(resultsDirectory, name);
    if (!statSync(directory).isDirectory()) continue;
    for (const run of readRuns(directory)) {
      if (run.outcome === 'infra' || run.reusedFrom !== undefined) continue;
      const list = byFingerprint.get(run.fingerprint) ?? [];
      list.push({ ...run, reusedFrom: name });
      byFingerprint.set(run.fingerprint, list);
    }
  }
  return byFingerprint;
};

export interface CellSummary {
  readonly journey: string;
  readonly split: 'train' | 'holdout';
  readonly arm: Arm;
  /** Graded runs. */
  readonly n: number;
  readonly passed: number;
  readonly infra: number;
  readonly passAt1: number;
  readonly interval: { low: number; high: number };
  /** At k = the number of graded runs. */
  readonly passAtK: number;
  readonly passHatK: number;
  /** Share of graded runs that took at least one detour. */
  readonly wrongTreeRate: number;
  readonly meanCostUsd: number;
  readonly meanTurns: number;
  /** How often each check failed, by name. */
  readonly failedChecks: Readonly<Record<string, number>>;
}

export const summarize = (runs: ReadonlyArray<RunRecord>): CellSummary[] => {
  const cells = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const key = `${run.journey}\0${run.arm}`;
    cells.set(key, [...(cells.get(key) ?? []), run]);
  }
  return [...cells.values()]
    .map(cell => {
      const [first] = cell;
      const graded = cell.filter(run => run.outcome !== 'infra');
      const n = graded.length;
      const passed = graded.filter(run => run.outcome === 'passed').length;
      const failedChecks: Record<string, number> = {};
      for (const run of graded) {
        for (const check of run.checks.filter(item => !item.ok)) {
          failedChecks[check.name] = (failedChecks[check.name] ?? 0) + 1;
        }
      }
      const mean = (values: number[]) =>
        values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
      return {
        journey: first!.journey,
        split: first!.split,
        arm: first!.arm,
        n,
        passed,
        infra: cell.length - n,
        passAt1: n === 0 ? 0 : passed / n,
        interval: wilson(passed, n),
        passAtK: n === 0 ? 0 : passAtK(n, passed, n),
        passHatK: n === 0 ? 0 : passHatK(n, passed, n),
        wrongTreeRate: n === 0 ? 0 : graded.filter(run => run.detours.length > 0).length / n,
        meanCostUsd: mean(cell.map(run => run.costUsd)),
        meanTurns: mean(graded.map(run => run.modelTurns)),
        failedChecks,
      };
    })
    .sort((left, right) =>
      left.split === right.split
        ? left.journey.localeCompare(right.journey) || left.arm.localeCompare(right.arm)
        : left.split === 'train'
          ? -1
          : 1
    );
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`;

/** Mean over journeys, so a journey with more runs does not count for more. */
const splitMean = (
  cells: ReadonlyArray<CellSummary>,
  split: 'train' | 'holdout',
  arm: Arm,
  pick: (cell: CellSummary) => number
): number | undefined => {
  const chosen = cells.filter(cell => cell.split === split && cell.arm === arm && cell.n > 0);
  return chosen.length === 0
    ? undefined
    : chosen.reduce((sum, cell) => sum + pick(cell), 0) / chosen.length;
};

export const renderSummary = (info: BatchInfo, runs: ReadonlyArray<RunRecord>): string => {
  const cells = summarize(runs);
  const totalCost = runs
    .filter(run => run.reusedFrom === undefined)
    .reduce((sum, run) => sum + run.costUsd, 0);
  const lines = [
    `# Batch ${info.id}`,
    '',
    `${info.agent} ${info.agentVersion}, ${info.model}, ${info.runs} run(s) per journey and arm.`,
    `Revision ${info.revision}${info.dirty ? ' with uncommitted changes' : ''}; skill ${info.skillSha256.slice(0, 12)}; harness ${info.harnessSha256.slice(0, 12)}.`,
    `Spent ${money(totalCost)} on new runs; ${runs.filter(run => run.reusedFrom !== undefined).length} run(s) reused.`,
    '',
    '| split | journey | arm | passed | pass@1 (95% CI) | pass@k | pass^k | wrong tree | mean cost | infra |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...cells.map(
      cell =>
        `| ${cell.split} | ${cell.journey} | ${cell.arm} | ${cell.passed}/${cell.n} | ${percent(cell.passAt1)} (${percent(cell.interval.low)}–${percent(cell.interval.high)}) | ${percent(cell.passAtK)} | ${percent(cell.passHatK)} | ${percent(cell.wrongTreeRate)} | ${money(cell.meanCostUsd)} | ${cell.infra} |`
    ),
    '',
    '| split | arm | mean pass@1 | mean pass^k | mean wrong tree |',
    '|---|---|---|---|---|',
  ];
  for (const split of ['train', 'holdout'] as const) {
    for (const arm of info.arms) {
      const passAt1 = splitMean(cells, split, arm, cell => cell.passAt1);
      if (passAt1 === undefined) continue;
      lines.push(
        `| ${split} | ${arm} | ${percent(passAt1)} | ${percent(splitMean(cells, split, arm, cell => cell.passHatK) ?? 0)} | ${percent(splitMean(cells, split, arm, cell => cell.wrongTreeRate) ?? 0)} |`
      );
    }
  }
  const failures = cells.filter(cell => Object.keys(cell.failedChecks).length > 0);
  if (failures.length > 0) {
    lines.push('', '## Failed checks', '');
    for (const cell of failures) {
      lines.push(`- ${cell.journey} (${cell.arm}):`);
      for (const [name, count] of Object.entries(cell.failedChecks)) {
        lines.push(`  - ${count}/${cell.n} ${name}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
};

/**
 * Baseline against candidate, per journey and per split, on the skill arm.
 * Refuses batches graded by different harnesses: their numbers do not compare.
 */
export const renderComparison = (
  baseline: { info: BatchInfo; runs: ReadonlyArray<RunRecord> },
  candidate: { info: BatchInfo; runs: ReadonlyArray<RunRecord> },
  options: { arm: Arm; allowHarnessChange: boolean }
): string => {
  const problems: string[] = [];
  if (baseline.info.harnessSha256 !== candidate.info.harnessSha256) {
    problems.push(
      'The batches were graded by different harnesses (journeys, graders, person or fake backend changed).'
    );
  }
  if (baseline.info.model !== candidate.info.model) {
    problems.push(`Different models: ${baseline.info.model} and ${candidate.info.model}.`);
  }
  if (baseline.info.agent !== candidate.info.agent) {
    problems.push(`Different agents: ${baseline.info.agent} and ${candidate.info.agent}.`);
  }
  if (problems.length > 0 && !options.allowHarnessChange) {
    throw new Error(`${problems.join('\n')}\nPass --allow-harness-change to compare anyway.`);
  }

  const before = new Map(
    summarize(baseline.runs)
      .filter(cell => cell.arm === options.arm)
      .map(cell => [cell.journey, cell])
  );
  const after = summarize(candidate.runs).filter(cell => cell.arm === options.arm);
  const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}`;
  const lines = [
    `# ${baseline.info.id} → ${candidate.info.id} (${options.arm} arm)`,
    '',
    ...problems.map(problem => `> ${problem}`),
    ...(problems.length > 0 ? [''] : []),
    `Skill ${baseline.info.skillSha256.slice(0, 12)} → ${candidate.info.skillSha256.slice(0, 12)}.`,
    '',
    '| split | journey | pass@1 | Δ pass@1 | pass^k | Δ pass^k | wrong tree | Δ wrong tree |',
    '|---|---|---|---|---|---|---|---|',
  ];
  const deltas = { train: [] as number[][], holdout: [] as number[][] };
  for (const cell of after) {
    const old = before.get(cell.journey);
    if (!old || old.n === 0 || cell.n === 0) continue;
    const delta = [
      cell.passAt1 - old.passAt1,
      cell.passHatK - old.passHatK,
      cell.wrongTreeRate - old.wrongTreeRate,
    ];
    deltas[cell.split].push(delta);
    lines.push(
      `| ${cell.split} | ${cell.journey} | ${percent(old.passAt1)} → ${percent(cell.passAt1)} | ${signed(delta[0]!)} | ${percent(old.passHatK)} → ${percent(cell.passHatK)} | ${signed(delta[1]!)} | ${percent(old.wrongTreeRate)} → ${percent(cell.wrongTreeRate)} | ${signed(delta[2]!)} |`
    );
  }
  lines.push(
    '',
    '| split | journeys | mean Δ pass@1 | mean Δ pass^k | mean Δ wrong tree |',
    '|---|---|---|---|---|'
  );
  for (const split of ['train', 'holdout'] as const) {
    const rows = deltas[split];
    if (rows.length === 0) continue;
    const mean = (index: number) => rows.reduce((sum, row) => sum + row[index]!, 0) / rows.length;
    lines.push(
      `| ${split} | ${rows.length} | ${signed(mean(0))} | ${signed(mean(1))} | ${signed(mean(2))} |`
    );
  }
  return `${lines.join('\n')}\n`;
};
