/**
 * Grader mutation: plays each journey's hand-authored path with one command
 * left out, and reports whether the journey's checks noticed.
 *
 *   bun run mutate.ts [--journeys <id,id>] [--json] [--strict]
 *
 * The path is played with no model (`src/scripted.ts`) against a fresh rig,
 * first whole, then once per dropped command, and graded by the same checks as
 * a replay. Verdicts are explained in `src/mutation.ts`.
 *
 * What a report shows: which commands of the taught path the checks depend
 * on, and which could go without any check failing. What it does not show:
 * that the checks catch a wrong path the hand-authored file never takes, or
 * anything about a real model.
 *
 * Exits 1 when an unmutated path fails a check, and with `--strict` also when
 * a step is `check-too-weak`: a way to end somewhere else that no check
 * noticed. `unused` is reported and never fails, because a read or a command
 * that fails on purpose changes nothing for an outcome check to notice.
 * Results go to `results/<batch>/` (git-ignored). Needs Docker; spends nothing.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { HAND_AUTHORED, listFixtures } from './src/fixtures';
import { journeyById, JOURNEYS, type Journey } from './src/journeys';
import {
  exitCodeOf,
  failuresOf,
  grade,
  renderReports,
  reportJourney,
  type Graded,
  type JourneyReport,
} from './src/mutation';
import { runJourneyWith } from './src/run-journey';
import { readScriptedPath, scriptedCommands, scriptedDriver } from './src/scripted';

const HERE = import.meta.dir;

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    journeys: { type: 'string' },
    json: { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
  },
});

const selected = (): ReadonlyArray<Journey> => {
  try {
    return values.journeys ? values.journeys.split(',').map(journeyById) : JOURNEYS;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Usage: bun run mutate.ts [--journeys <id,id>] [--json] [--strict]');
    process.exit(2);
  }
};
const journeys = selected();

const scripted = new Map(
  listFixtures()
    .filter(fixture => fixture.provider === 'openai' && fixture.model === HAND_AUTHORED)
    .map(fixture => [fixture.journeyId, fixture.path])
);

const play = async (journey: Journey, path: string, drop?: number): Promise<Graded> => {
  const run = await runJourneyWith(journey, scriptedDriver(path, { drop }));
  try {
    return grade(journey, run);
  } finally {
    await run.rig.stop();
  }
};

const reports: JourneyReport[] = [];
for (const journey of journeys) {
  const path = scripted.get(journey.id);
  // e2e.test.ts already fails when a journey has no hand-authored path.
  if (!path) throw new Error(`${journey.id} has no hand-authored fixture`);
  const fixture = relative(HERE, path);
  const commands = scriptedCommands(readScriptedPath(path));
  console.error(`${journey.id}: unmutated path`);
  const unmutated = await play(journey, path);
  const mutated: Array<{ command: string; graded: Graded }> = [];
  if (unmutated.checks.every(check => check.ok)) {
    for (const [index, command] of commands.entries()) {
      console.error(`${journey.id}: without step ${index + 1}, ${command.slice(0, 80)}`);
      mutated.push({ command, graded: await play(journey, path, index) });
    }
  }
  reports.push(reportJourney({ journey: journey.id, fixture, unmutated, mutated }));
}

const table = renderReports(reports);
const batch = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-mutate`;
const directory = join(HERE, 'results', batch);
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, 'mutations.json'), `${JSON.stringify(reports, null, 2)}\n`);
writeFileSync(join(directory, 'summary.txt'), table);

process.stdout.write(values.json ? `${JSON.stringify(reports, null, 2)}\n` : table);
console.error(`written   ${relative(process.cwd(), directory)}`);
const failures = failuresOf(reports, values.strict ?? false);
for (const failure of failures) console.error(`failed    ${failure}`);
process.exit(exitCodeOf(reports, values.strict ?? false));
