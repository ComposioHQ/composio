/**
 * Grading a hand-authored path with one command left out, as `mutate.ts`
 * does. Kept apart from the script so the verdicts can be tested on made-up
 * evidence, without a container.
 *
 * A dropped command is `needed` when some check fails without it. When none
 * fails, the run is compared with the unmutated one by what it left behind:
 * the same outcome means the command was `unused`; another outcome means the
 * run ended somewhere else and no check noticed, `check-too-weak`.
 */

import type { Check, Evidence, Journey } from './journeys';

export type Verdict = 'needed' | 'unused' | 'check-too-weak';

export interface Graded {
  readonly checks: ReadonlyArray<Check>;
  /** What the run left behind, in a form two runs can be compared by. */
  readonly outcome: string;
}

export interface StepReport {
  /** Position of the dropped command in the path, from 1. */
  readonly step: number;
  readonly command: string;
  readonly verdict: Verdict;
  readonly passed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
}

export interface JourneyReport {
  readonly journey: string;
  readonly fixture: string;
  /** The unmutated path. When it fails a check, nothing about the steps can be concluded. */
  readonly unmutated: { readonly ok: boolean; readonly failed: ReadonlyArray<string> };
  readonly steps: ReadonlyArray<StepReport>;
}

/**
 * What the person would find once the agent stopped: the tools that ran, with
 * what, as whom, on which project; the connections made during the run; the
 * CLI logins; and whether the next command finds a stored login. Reads and
 * the order of requests are left out, so a run that only skipped a lookup has
 * the same outcome.
 */
export const outcomeOf = (run: Evidence): string =>
  JSON.stringify({
    executions: run.requests.flatMap(entry =>
      entry.effect === 'tool-executed' && entry.tool
        ? [
            {
              tool: entry.tool.slug,
              arguments: entry.tool.arguments,
              project: entry.project,
              user: entry.userId,
            },
          ]
        : []
    ),
    connections: run.world.connections
      .filter(connection => !run.startingConnections.includes(connection.id))
      .map(connection => ({
        toolkit: connection.toolkit,
        project: connection.projectLabel,
        user: connection.userId,
        status: connection.status,
      })),
    logins: run.world.loginSessions.map(session => session.status),
    storedLogin: run.whoamiAfter.exitCode === 0,
  });

export const grade = (journey: Journey, run: Evidence): Graded => ({
  checks: journey.checks(run),
  outcome: outcomeOf(run),
});

const names = (checks: ReadonlyArray<Check>, ok: boolean) =>
  checks.filter(check => check.ok === ok).map(check => check.name);

export const verdictOf = (unmutated: Graded, mutated: Graded): Verdict => {
  if (mutated.checks.some(check => !check.ok)) return 'needed';
  return mutated.outcome === unmutated.outcome ? 'unused' : 'check-too-weak';
};

export const reportJourney = (input: {
  journey: string;
  fixture: string;
  unmutated: Graded;
  /** One per dropped command, in path order; empty when the unmutated path failed. */
  mutated: ReadonlyArray<{ command: string; graded: Graded }>;
}): JourneyReport => {
  const failed = names(input.unmutated.checks, false);
  return {
    journey: input.journey,
    fixture: input.fixture,
    unmutated: { ok: failed.length === 0, failed },
    steps:
      failed.length > 0
        ? []
        : input.mutated.map(({ command, graded }, index) => ({
            step: index + 1,
            command,
            verdict: verdictOf(input.unmutated, graded),
            passed: names(graded.checks, true),
            failed: names(graded.checks, false),
          })),
  };
};

/**
 * Why a run exits non-zero, in the order a reader would fix them. An
 * unmutated path that fails means the harness or the CLI is broken, and no
 * verdict means anything. With `strict`, a `check-too-weak` step also fails:
 * the run ended somewhere else and no check noticed.
 *
 * `unused` never fails. A read, a `--help`, or a command that fails on purpose
 * changes nothing for a check to notice, and the checks grade the outcome, so
 * a journey made only of `needed` steps is not a state worth aiming at.
 */
export const failuresOf = (
  reports: ReadonlyArray<JourneyReport>,
  strict: boolean
): ReadonlyArray<string> => [
  ...reports
    .filter(report => !report.unmutated.ok)
    .map(report => `${report.journey}: the unmutated path failed a check`),
  ...(strict
    ? reports.flatMap(report =>
        report.steps
          .filter(step => step.verdict === 'check-too-weak')
          .map(step => `${report.journey}: step ${step.step} (${step.command}) is check-too-weak`)
      )
    : []),
];

/** 1 when `failuresOf` is not empty, else 0. */
export const exitCodeOf = (reports: ReadonlyArray<JourneyReport>, strict: boolean): number =>
  failuresOf(reports, strict).length > 0 ? 1 : 0;

const COMMAND_WIDTH = 60;

const shorten = (command: string): string =>
  command.length <= COMMAND_WIDTH ? command : `${command.slice(0, COMMAND_WIDTH - 1)}…`;

export const renderReports = (reports: ReadonlyArray<JourneyReport>): string => {
  const lines: string[] = [];
  for (const report of reports) {
    lines.push(`mutate: ${report.journey} (${report.fixture})`);
    if (!report.unmutated.ok) {
      lines.push('unmutated path  FAILED; no step was dropped');
      for (const name of report.unmutated.failed) lines.push(`  failed: ${name}`);
      lines.push('');
      continue;
    }
    lines.push('unmutated path  pass');
    lines.push(
      `${'step'.padEnd(5)}${'dropped command'.padEnd(COMMAND_WIDTH + 2)}${'verdict'.padEnd(16)}checks passed`
    );
    for (const step of report.steps) {
      const total = step.passed.length + step.failed.length;
      lines.push(
        `${String(step.step).padEnd(5)}${shorten(step.command).padEnd(COMMAND_WIDTH + 2)}${step.verdict.padEnd(16)}${step.passed.length}/${total}`
      );
      for (const name of step.failed) lines.push(`       failed: ${name}`);
    }
    lines.push('');
  }
  const steps = reports.flatMap(report => report.steps);
  const count = (verdict: Verdict) => steps.filter(step => step.verdict === verdict).length;
  const broken = reports.filter(report => !report.unmutated.ok).length;
  lines.push(
    `${steps.length} step(s): ${count('needed')} needed, ${count('unused')} unused, ${count('check-too-weak')} check-too-weak` +
      (broken > 0 ? `; ${broken} unmutated path(s) FAILED` : '')
  );
  return `${lines.join('\n')}\n`;
};
