/**
 * Runs one journey: a fresh rig, the skill's files in the container, the
 * journey's starting state, then the agent loop.
 */

import { startCliRig } from '@e2e-tests/cli-fake-backend/rig';
import { runAgent, type ModelAdapter } from './agent';
import type { Journey, JourneyRun } from './journeys';
import { BROWSER_PATH, BROWSER_SCRIPT, personFor } from './person';
import { scrub } from './scrub';
import { buildSkill, SKILL_DIRECTORY, systemPrompt } from './skill';

/** Upper bound on model turns. The longest scripted journey takes eight. */
export const MAX_TURNS = 12;

/** Upper bound on one command, so a command that waits for a person cannot stall a run. */
const COMMAND_TIMEOUT_SECONDS = 90;

export interface AdapterInputs {
  readonly system: string;
  readonly prompt: string;
}

export const runJourney = async (
  journey: Journey,
  makeAdapter: (inputs: AdapterInputs) => ModelAdapter
): Promise<JourneyRun> => {
  const rig = await startCliRig({ label: journey.id });
  try {
    const skill = buildSkill();
    await rig.journey.writeFile(`${SKILL_DIRECTORY}/SKILL.md`, skill.skillMarkdown);
    for (const [name, markdown] of Object.entries(skill.references)) {
      await rig.journey.writeFile(`${SKILL_DIRECTORY}/references/${name}`, markdown);
    }
    await rig.journey.writeFile(BROWSER_PATH, BROWSER_SCRIPT);
    await rig.run(`chmod +x ${BROWSER_PATH}`);
    // Nothing is approved by waiting: only the person approves, see `person.ts`.
    rig.fake.world.linkCompletesAfterPolls = null;
    await journey.setup(rig);
    const person = personFor(rig.fake.world);

    const mark = rig.fake.journal.mark();
    const transcript = await runAgent({
      adapter: makeAdapter({ system: systemPrompt(skill), prompt: journey.prompt }),
      maxTurns: MAX_TURNS,
      hear: person.hear,
      execute: async command => {
        const result = await rig.run(command, {
          cwd: journey.cwd,
          timeoutSeconds: COMMAND_TIMEOUT_SECONDS,
        });
        return {
          exitCode: result.exitCode,
          stdout: scrub(result.stdout, rig.fake),
          stderr: scrub(result.stderr, rig.fake),
        };
      },
    });
    return { transcript, rig, requests: rig.fake.journal.since(mark) };
  } catch (error) {
    await rig.stop();
    throw error;
  }
};
