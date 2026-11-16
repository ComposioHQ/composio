/**
 * Runs one journey: a fresh rig, the skill where the agent finds it, the
 * journey's starting state, then an agent, and the evidence it left.
 *
 * The agent is a driver. The replay tests and `record.ts` use the minimal
 * loop in `agent.ts`; other agents can use the same driver contract and evidence checks.
 */

import { startCliRig, type CliRig, type RigOptions } from '@e2e-tests/cli-fake-backend/rig';
import type { JournalEntry } from '@e2e-tests/cli-fake-backend';
import { runAgent, type ModelAdapter, type Transcript } from './agent';
import type { Journey, JourneyRun } from './journeys';
import { BROWSER_PATH, BROWSER_SCRIPT, personFor, type Person } from './person';
import { scrub, SCRUBBED_BACKEND_URL, SCRUBBED_DASHBOARD_URL } from './scrub';
import { buildSkill, SKILL_DIRECTORY, systemPrompt, type BuiltSkill } from './skill';
import type { Usage } from './usage';

/** Upper bound on model turns. The longest scripted journey takes eight. */
export const MAX_TURNS = 12;

/** Upper bound on one command, so a command that waits for a person cannot stall a run. */
export const COMMAND_TIMEOUT_SECONDS = 90;

export interface AdapterInputs {
  readonly system: string;
  readonly prompt: string;
}

export interface DriverContext {
  readonly rig: CliRig;
  readonly journey: Journey;
  readonly person: Person;
  /** The skill, when the driver places it. */
  readonly skill: BuiltSkill | undefined;
}

export interface DriverResult {
  readonly transcript: Transcript;
  /** The requests each command caused, in the order of `transcript.commands`. */
  readonly commandRequests: ReadonlyArray<ReadonlyArray<JournalEntry>>;
  readonly usage?: Usage;
}

export interface Driver {
  /**
   * Where the skill goes: the system prompt of the minimal loop, the skills
   * directory Claude Code reads, or nowhere (the run without the skill).
   */
  readonly skill: 'system-prompt' | 'claude-code-skills' | 'none';
  /**
   * Whether the agent reads command output with the per-run URLs and clocks
   * replaced. Replay needs it; a live agent reads what the CLI printed.
   */
  readonly scrubbed: boolean;
  readonly readOnlyMounts?: RigOptions['readOnlyMounts'];
  drive(context: DriverContext): Promise<DriverResult>;
}

/** Where Claude Code looks for user skills, under the journey's home. */
export const claudeSkillDirectory = (home: string): string => `${home}/.claude/skills/composio-cli`;

const placeSkill = async (rig: CliRig, directory: string, skill: BuiltSkill): Promise<void> => {
  await rig.journey.writeFile(`${directory}/SKILL.md`, skill.skillMarkdown);
  for (const [name, markdown] of Object.entries(skill.references)) {
    await rig.journey.writeFile(`${directory}/references/${name}`, markdown);
  }
};

export const runJourneyWith = async (journey: Journey, driver: Driver): Promise<JourneyRun> => {
  const rig = await startCliRig({ label: journey.id, readOnlyMounts: driver.readOnlyMounts });
  try {
    const skill = driver.skill === 'none' ? undefined : buildSkill();
    if (skill && driver.skill === 'system-prompt') await placeSkill(rig, SKILL_DIRECTORY, skill);
    if (skill && driver.skill === 'claude-code-skills') {
      await placeSkill(rig, claudeSkillDirectory(rig.journey.home), skill);
    }
    await rig.journey.writeFile(BROWSER_PATH, BROWSER_SCRIPT);
    await rig.run(`chmod +x ${BROWSER_PATH}`);
    // Nothing is approved by waiting: only the person approves, see `person.ts`.
    rig.fake.world.linkCompletesAfterPolls = null;
    await journey.setup(rig);
    // The person reads what the agent writes, so they see the URLs the agent saw.
    const person = personFor(
      rig.fake.world,
      driver.scrubbed
        ? { dashboard: SCRUBBED_DASHBOARD_URL, backend: SCRUBBED_BACKEND_URL }
        : { dashboard: rig.fake.docker.https, backend: rig.fake.docker.http }
    );
    const startingConnections = rig.fake.world.connections.map(connection => connection.id);

    const mark = rig.fake.journal.mark();
    const { transcript, commandRequests, usage } = await driver.drive({
      rig,
      journey,
      person,
      skill,
    });
    const requests = rig.fake.journal.since(mark);
    const whoami = await rig.run('composio whoami', { timeoutSeconds: COMMAND_TIMEOUT_SECONDS });
    return {
      transcript,
      rig,
      world: rig.fake.world,
      requests,
      commandRequests,
      startingConnections,
      whoamiAfter: { exitCode: whoami.exitCode, stdout: whoami.stdout, stderr: whoami.stderr },
      usage,
    };
  } catch (error) {
    await rig.stop();
    throw error;
  }
};

/**
 * The minimal loop of `agent.ts`. With `skill: 'none'` the model gets no
 * system prompt at all.
 */
export const loopDriver = (
  makeAdapter: (inputs: AdapterInputs) => ModelAdapter,
  options: { skill?: 'system-prompt' | 'none'; scrubbed?: boolean } = {}
): Driver => ({
  skill: options.skill ?? 'system-prompt',
  scrubbed: options.scrubbed ?? true,
  drive: async ({ rig, journey, person, skill }) => {
    const commandRequests: Array<ReadonlyArray<JournalEntry>> = [];
    const adapter = makeAdapter({
      system: skill ? systemPrompt(skill) : '',
      prompt: journey.prompt,
    });
    const transcript = await runAgent({
      adapter,
      maxTurns: MAX_TURNS,
      hear: person.hear,
      execute: async command => {
        const result = await rig.run(command, {
          cwd: journey.cwd,
          timeoutSeconds: COMMAND_TIMEOUT_SECONDS,
        });
        commandRequests.push(result.requests);
        const shown = (text: string) => (options.scrubbed === false ? text : scrub(text, rig.fake));
        return {
          exitCode: result.exitCode,
          stdout: shown(result.stdout),
          stderr: shown(result.stderr),
        };
      },
    });
    return { transcript, commandRequests, usage: adapter.usage?.() };
  },
});

export const runJourney = (
  journey: Journey,
  makeAdapter: (inputs: AdapterInputs) => ModelAdapter
): Promise<JourneyRun> => runJourneyWith(journey, loopDriver(makeAdapter));
