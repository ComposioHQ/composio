/**
 * Grader mutation, without a container: the scripted path plays what the
 * hand-authored file says, a dropped command keeps the rest of the path, and
 * each verdict follows from made-up evidence.
 */

import { describe, expect, it } from 'bun:test';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  World,
  type JournalEntry,
} from '@e2e-tests/cli-fake-backend';
import { runAgent, type ModelAdapter, type ModelTurn, type ShellOutcome } from './src/agent';
import { fixturePath, HAND_AUTHORED } from './src/fixtures';
import type { Check, Evidence, Journey } from './src/journeys';
import {
  exitCodeOf,
  grade,
  outcomeOf,
  renderReports,
  reportJourney,
  verdictOf,
} from './src/mutation';
import { readScriptedPath, scriptedAdapter, scriptedCommands } from './src/scripted';

const OK: ShellOutcome = { exitCode: 0, stdout: '', stderr: '' };

/** Plays an adapter against a shell that answers every command with `OK`. */
const play = (
  adapter: ModelAdapter,
  hear?: (message: string, waiting: boolean) => string | undefined
) => {
  const ran: string[] = [];
  return runAgent({
    adapter,
    maxTurns: 12,
    hear,
    execute: async command => {
      ran.push(command);
      return OK;
    },
  }).then(transcript => ({ transcript, ran }));
};

const turns: ReadonlyArray<ModelTurn> = [
  { text: '', calls: [{ id: 'a', command: 'composio whoami' }] },
  { text: 'Open the page, I will wait.', calls: [{ id: 'b', command: 'composio login --poll' }] },
  { text: '', calls: [{ id: 'c', command: 'composio whoami' }] },
  { text: 'Logged in.', calls: [] },
];

describe('the scripted path', () => {
  it('reads the hand-authored file turn by turn, shell calls only', () => {
    const path = readScriptedPath(fixturePath('first-run-login', 'openai', HAND_AUTHORED));
    expect(scriptedCommands(path)).toEqual([
      'composio whoami',
      'composio login',
      'composio login --poll',
      'composio whoami',
    ]);
    expect(path.at(-1)).toEqual({
      text: 'The CLI is now logged in as dev@acme-e2e.test.',
      calls: [],
    });
  });

  it('plays every command, then finishes on the last turn', async () => {
    const { transcript, ran } = await play(scriptedAdapter(turns));
    expect(ran).toEqual(['composio whoami', 'composio login --poll', 'composio whoami']);
    expect(transcript.stop).toBe('finished');
    expect(transcript.modelTurns).toBe(4);
  });

  it('leaves out the dropped command and plays the turns after it', async () => {
    const { transcript, ran } = await play(scriptedAdapter(turns, { drop: 1 }));
    expect(ran).toEqual(['composio whoami', 'composio whoami']);
    expect(transcript.messages).toEqual(['Open the page, I will wait.', 'Logged in.']);
    expect(transcript.stop).toBe('finished');
    expect(transcript.modelTurns).toBe(4);
  });

  it('hands the person the text of a turn whose command was dropped', async () => {
    const heard: Array<[string, boolean]> = [];
    await play(scriptedAdapter(turns, { drop: 1 }), (message, waiting) => {
      heard.push([message, waiting]);
      return undefined;
    });
    expect(heard[1]).toEqual(['Open the page, I will wait.', true]);
  });

  it('stops as the script ending when the person answers its last turn', async () => {
    const { transcript, ran } = await play(scriptedAdapter(turns), () => 'Thanks.');
    expect(ran).toEqual(['composio whoami', 'composio login --poll', 'composio whoami']);
    expect(transcript.stop).toEqual({ provider: 'script-ended' });
  });
});

describe('runAgent with an adapter that does not say whether more turns follow', () => {
  // A model's turn without a command is its last, as before `hasMore` existed.
  it('stops at the first turn that asks for no command', async () => {
    let asked = 0;
    const adapter: ModelAdapter = {
      provider: 'openai',
      model: 'test',
      next: async () => {
        asked += 1;
        return asked === 1 ? { text: 'Nothing to do.', calls: [] } : turns[0]!;
      },
      record: () => {},
      say: () => {},
    };
    const { transcript, ran } = await play(adapter);
    expect(asked).toBe(1);
    expect(ran).toEqual([]);
    expect(transcript.stop).toBe('finished');
  });
});

/** A made-up journal entry: a request that changed nothing, unless `fields` say otherwise. */
const entry = (fields: Partial<JournalEntry>): JournalEntry => ({
  seq: 1,
  role: 'backend',
  method: 'POST',
  path: '/',
  query: {},
  route: null,
  keyClass: 'user',
  keyKnown: true,
  orgId: null,
  project: CONSUMER_PROJECT.label,
  requestedProject: null,
  projectFrom: null,
  userId: null,
  body: null,
  status: 200,
  effect: null,
  tool: null,
  fault: null,
  ...fields,
});

// Made-up evidence: what the verdicts read is the checks and the outcome.
const evidenceWith = (world: World, requests: ReadonlyArray<JournalEntry> = []): Evidence => ({
  transcript: { commands: [], messages: [], replies: [], stop: 'finished', modelTurns: 1 },
  world,
  requests,
  commandRequests: [],
  startingConnections: [],
  whoamiAfter: OK,
});

const journeyChecking = (checks: (run: Evidence) => ReadonlyArray<Check>): Journey => ({
  id: 'made-up',
  title: 'made up',
  prompt: '',
  split: 'train',
  setup: async () => {},
  checks,
});

/** Passes when a login session exists and is linked; says nothing about anything else. */
const loggedIn = journeyChecking(run => [
  { name: 'a login session was linked', ok: run.world.loginSessions[0]?.status === 'linked' },
]);

const linkedWorld = () => {
  const world = new World();
  world.linkLoginSession(world.createLoginSession().id);
  return world;
};

describe('verdicts', () => {
  const unmutated = grade(loggedIn, evidenceWith(linkedWorld()));

  it('calls a step needed when a check fails without it', () => {
    const mutated = grade(loggedIn, evidenceWith(new World()));
    expect(verdictOf(unmutated, mutated)).toBe('needed');
  });

  it('calls a step unused when every check passes and the outcome is the same', () => {
    const mutated = grade(loggedIn, evidenceWith(linkedWorld()));
    expect(verdictOf(unmutated, mutated)).toBe('unused');
  });

  it('calls a check too weak when every check passes but the run ended elsewhere', () => {
    // The same login, plus a Slack account connected that the unmutated run never connected.
    const world = linkedWorld();
    world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    const mutated = grade(loggedIn, evidenceWith(world));
    expect(mutated.checks.every(check => check.ok)).toBe(true);
    expect(verdictOf(unmutated, mutated)).toBe('check-too-weak');
  });

  it('leaves the connections the setup made out of the outcome', () => {
    const world = new World();
    const seeded = world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    expect(outcomeOf({ ...evidenceWith(world), startingConnections: [seeded.id] })).toBe(
      outcomeOf(evidenceWith(new World()))
    );
  });

  it('counts a tool that ran in the outcome, and a request that changed nothing not', () => {
    const quiet = outcomeOf(evidenceWith(new World()));
    expect(outcomeOf(evidenceWith(new World(), [entry({ route: 'tools.list' })]))).toBe(quiet);
    expect(
      outcomeOf(
        evidenceWith(new World(), [
          entry({ effect: 'tool-executed', tool: { slug: 'SLACK_SEND_MESSAGE', arguments: {} } }),
        ])
      )
    ).not.toBe(quiet);
  });
  // Every field the outcome compares, one at a time: if `outcomeOf` stopped
  // reading one, a run that ended elsewhere in that way would be called `unused`.
  describe('an outcome that differs in one thing', () => {
    const sentToGeneral = (fields: Partial<JournalEntry> = {}) =>
      entry({
        effect: 'tool-executed',
        userId: CONSUMER_USER_ID,
        tool: { slug: 'SLACK_SEND_MESSAGE', arguments: { channel: 'general' } },
        ...fields,
      });
    const ended = (
      options: {
        login?: 'pending' | 'linked';
        connection?: 'begun' | 'connected';
        execution?: JournalEntry;
        whoamiAfter?: ShellOutcome;
      } = {}
    ): Evidence => {
      const world = new World();
      const session = world.createLoginSession();
      if ((options.login ?? 'linked') === 'linked') world.linkLoginSession(session.id);
      if ((options.connection ?? 'connected') === 'connected') {
        world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
      } else {
        world.beginConnection({
          projectLabel: CONSUMER_PROJECT.label,
          userId: CONSUMER_USER_ID,
          toolkit: 'slack',
        });
      }
      return {
        ...evidenceWith(world, [options.execution ?? sentToGeneral()]),
        whoamiAfter: options.whoamiAfter ?? OK,
      };
    };

    it('is the same outcome when nothing differs', () => {
      expect(outcomeOf(ended())).toBe(outcomeOf(ended()));
    });

    const differences: ReadonlyArray<[string, Evidence]> = [
      ['the login was never linked', ended({ login: 'pending' })],
      [
        'the next whoami finds no login',
        ended({ whoamiAfter: { exitCode: 1, stdout: '', stderr: 'not logged in' } }),
      ],
      ['the connection was begun but never authorized', ended({ connection: 'begun' })],
      [
        'the tool ran with other arguments',
        ended({
          execution: sentToGeneral({
            tool: { slug: 'SLACK_SEND_MESSAGE', arguments: { channel: 'random' } },
          }),
        }),
      ],
      [
        'the tool ran on another project',
        ended({ execution: sentToGeneral({ project: DEVELOPER_PROJECT.label }) }),
      ],
      [
        'the tool ran as another user',
        ended({ execution: sentToGeneral({ userId: 'someone-else' }) }),
      ],
    ];

    for (const [name, run] of differences) {
      it(`is another outcome when ${name}`, () => {
        expect(outcomeOf(run)).not.toBe(outcomeOf(ended()));
      });
    }
  });
});

describe('reports', () => {
  const unmutated = grade(loggedIn, evidenceWith(linkedWorld()));
  const weakWorld = linkedWorld();
  weakWorld.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
  const report = reportJourney({
    journey: 'made-up',
    fixture: 'fixtures/made-up.openai.hand-authored.json',
    unmutated,
    mutated: [
      { command: 'composio login', graded: grade(loggedIn, evidenceWith(new World())) },
      { command: 'composio whoami', graded: grade(loggedIn, evidenceWith(linkedWorld())) },
      { command: 'composio link slack', graded: grade(loggedIn, evidenceWith(weakWorld)) },
    ],
  });

  it('gives one row per dropped command, numbered from 1, with the checks on each side', () => {
    expect(report.unmutated).toEqual({ ok: true, failed: [] });
    expect(report.steps).toEqual([
      {
        step: 1,
        command: 'composio login',
        verdict: 'needed',
        passed: [],
        failed: ['a login session was linked'],
      },
      {
        step: 2,
        command: 'composio whoami',
        verdict: 'unused',
        passed: ['a login session was linked'],
        failed: [],
      },
      {
        step: 3,
        command: 'composio link slack',
        verdict: 'check-too-weak',
        passed: ['a login session was linked'],
        failed: [],
      },
    ]);
  });

  it('exits 0 by default, and 1 with --strict when a step is not needed', () => {
    expect(exitCodeOf([report], false)).toBe(0);
    expect(exitCodeOf([report], true)).toBe(1);
  });

  it('exits 0 with --strict when every step is needed', () => {
    expect(exitCodeOf([{ ...report, steps: report.steps.slice(0, 1) }], true)).toBe(0);
  });

  it('renders a row per step and a total', () => {
    const table = renderReports([report]);
    expect(table).toContain('unmutated path  pass');
    expect(table).toMatch(/^1 +composio login +needed +0\/1$/m);
    expect(table).toContain('failed: a login session was linked');
    expect(table).toMatch(/^3 +composio link slack +check-too-weak +1\/1$/m);
    expect(table).toContain('3 step(s): 1 needed, 1 unused, 1 check-too-weak');
  });

  describe('when the unmutated path fails a check', () => {
    const broken = reportJourney({
      journey: 'made-up',
      fixture: 'fixtures/made-up.openai.hand-authored.json',
      unmutated: grade(loggedIn, evidenceWith(new World())),
      mutated: [
        { command: 'composio whoami', graded: grade(loggedIn, evidenceWith(linkedWorld())) },
      ],
    });

    it('reports no step, since no verdict would mean anything', () => {
      expect(broken.unmutated).toEqual({ ok: false, failed: ['a login session was linked'] });
      expect(broken.steps).toEqual([]);
    });

    it('exits 1 with or without --strict', () => {
      expect(exitCodeOf([report, broken], false)).toBe(1);
      expect(exitCodeOf([broken], true)).toBe(1);
    });

    it('says so in the table', () => {
      expect(renderReports([broken])).toContain('unmutated path  FAILED; no step was dropped');
      expect(renderReports([broken])).toContain('1 unmutated path(s) FAILED');
    });
  });
});
