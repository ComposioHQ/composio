/**
 * The graders, without a container: a run that reached the goal passes, and
 * each way of looking as if it did fails the check that names it.
 */

import { describe, expect, it } from 'bun:test';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  GLOBAL_TEST_USER_ID,
  MEMBER,
  ORG,
  World,
  type JournalEntry,
} from '@e2e-tests/cli-fake-backend';
import { toolPayload, type ExecutedCommand, type ShellOutcome } from './src/agent';
import { journeyById, type Evidence } from './src/journeys';

const TIMESTAMP = '1767225600.000100';
const LOGGED_IN: ShellOutcome = {
  exitCode: 0,
  stdout: `{"account_type":"human","email":"${MEMBER.email}","current_org_name":"${ORG.name}"}\n`,
  stderr: '',
};

let seq = 0;
const request = (fields: Partial<JournalEntry>): JournalEntry => ({
  seq: (seq += 1),
  role: 'backend',
  method: 'POST',
  path: '/',
  query: {},
  route: null,
  keyClass: 'user',
  keyKnown: true,
  orgId: ORG.id,
  project: null,
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

const send = (
  tree: 'consumer' | 'developer',
  args: Record<string, unknown>,
  fields: Partial<JournalEntry> = {}
): JournalEntry =>
  request({
    role: tree === 'consumer' ? 'dashboard' : 'backend',
    route: tree === 'consumer' ? 'dashboard.execute' : 'toolRouter.session.execute',
    project: tree === 'consumer' ? CONSUMER_PROJECT.label : DEVELOPER_PROJECT.label,
    // A developer command names its project; the Dashboard resolves the consumer one.
    requestedProject: tree === 'consumer' ? null : DEVELOPER_PROJECT.label,
    userId: tree === 'consumer' ? CONSUMER_USER_ID : GLOBAL_TEST_USER_ID,
    effect: 'tool-executed',
    tool: { slug: 'SLACK_SEND_MESSAGE', arguments: args },
    ...fields,
  });

/** One shell command and the requests it caused. */
const step = (
  command: string,
  requests: ReadonlyArray<JournalEntry> = [],
  outcome: Partial<ShellOutcome> = {}
) => {
  const result: ShellOutcome = { exitCode: 0, stdout: '', stderr: '', ...outcome };
  const executed: ExecutedCommand = { command, ...result, payload: toolPayload(result) };
  return { executed, requests };
};

const evidence = (
  world: World,
  steps: ReadonlyArray<ReturnType<typeof step>>,
  overrides: Partial<Evidence> = {}
): Evidence => ({
  transcript: {
    commands: steps.map(taken => taken.executed),
    messages: [],
    replies: [],
    stop: 'finished',
    modelTurns: steps.length + 1,
  },
  world,
  requests: steps.flatMap(taken => taken.requests),
  commandRequests: steps.map(taken => taken.requests),
  startingConnections: [],
  whoamiAfter: LOGGED_IN,
  ...overrides,
});

const failed = (id: string, run: Evidence): string[] =>
  journeyById(id)
    .checks(run)
    .filter(check => !check.ok)
    .map(check => check.name);

const detoursTaken = (id: string, run: Evidence): string[] =>
  (journeyById(id).detours?.(run) ?? []).filter(check => !check.ok).map(check => check.name);

const DEV_SEND = `composio dev playground-execute SLACK_SEND_MESSAGE -d '{}'`;
const ROOT_SEND = `composio execute SLACK_SEND_MESSAGE -d '{}'`;
const hello = { channel: 'general', text: 'hello from dev' };

describe('developer-execute-unconnected', () => {
  const id = 'developer-execute-unconnected';
  const connected = () => {
    const world = new World();
    world.connect(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack');
    return world;
  };

  it('passes when the message was sent once, on the developer project', () => {
    expect(failed(id, evidence(connected(), [step(DEV_SEND, [send('developer', hello)])]))).toEqual(
      []
    );
  });

  it('fails when the message was also sent on the consumer project', () => {
    const world = connected();
    world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    const run = evidence(world, [
      step('composio link slack'),
      step(ROOT_SEND, [send('consumer', hello)]),
      step(DEV_SEND, [send('developer', hello)]),
    ]);
    expect(failed(id, run)).toEqual([
      'SLACK_SEND_MESSAGE completed once in the whole run',
      `it ran on the ${DEVELOPER_PROJECT.label} project, as ${GLOBAL_TEST_USER_ID}`,
      `no account was connected outside the ${DEVELOPER_PROJECT.label} project`,
    ]);
  });

  it('fails when the person approved a consumer connection, even with nothing sent there', () => {
    const world = connected();
    world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    const run = evidence(world, [
      step('composio link slack'),
      step(DEV_SEND, [send('developer', hello)]),
    ]);
    expect(failed(id, run)).toEqual([
      `no account was connected outside the ${DEVELOPER_PROJECT.label} project`,
    ]);
  });

  it('passes after a wrong-tree attempt that changed nothing, and reports the detour', () => {
    const attempt = request({
      role: 'dashboard',
      route: 'dashboard.execute',
      project: CONSUMER_PROJECT.label,
      userId: CONSUMER_USER_ID,
    });
    const run = evidence(connected(), [
      step(ROOT_SEND, [attempt], { exitCode: 1 }),
      step(DEV_SEND, [send('developer', hello)]),
    ]);
    expect(failed(id, run)).toEqual([]);
    expect(detoursTaken(id, run)).toEqual([
      'no root `composio execute` tried to run the tool',
      'nothing was executed or linked on the consumer project, completed or not',
    ]);
  });

  it('does not count describing the tool on the root tree as trying to run it', () => {
    const run = evidence(connected(), [
      step('composio execute SLACK_SEND_MESSAGE --get-schema'),
      step(DEV_SEND, [send('developer', hello)]),
    ]);
    expect(detoursTaken(id, run)).toEqual([]);
  });

  it('fails when the request named another project, or none, and the session decided', () => {
    const scopeCheck = `it ran on the ${DEVELOPER_PROJECT.label} project, as ${GLOBAL_TEST_USER_ID}`;
    const crossed = send('developer', hello, { requestedProject: CONSUMER_PROJECT.label });
    const unscoped = send('developer', hello, { requestedProject: null });
    expect(failed(id, evidence(connected(), [step(DEV_SEND, [crossed])]))).toEqual([scopeCheck]);
    expect(failed(id, evidence(connected(), [step(DEV_SEND, [unscoped])]))).toEqual([scopeCheck]);
  });
});

describe('consumer-slack-message', () => {
  const id = 'consumer-slack-message';
  const connected = () => {
    const world = new World();
    world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    return world;
  };
  const sent = (args: Record<string, unknown>) =>
    evidence(connected(), [step(ROOT_SEND, [send('consumer', args)])]);

  it('passes for #general or general, with the text as asked', () => {
    expect(failed(id, sent({ channel: '#general', text: 'deploy finished' }))).toEqual([]);
    expect(failed(id, sent({ channel: 'general', text: 'deploy finished' }))).toEqual([]);
  });

  it('fails on another channel', () => {
    expect(failed(id, sent({ channel: 'private-leadership', text: 'deploy finished' }))).toEqual([
      'it went to #general',
    ]);
  });

  it('fails on other words around the text', () => {
    expect(failed(id, sent({ channel: '#general', text: 'deploy finished WRONG TEXT' }))).toEqual([
      'its text was exactly "deploy finished"',
    ]);
  });

  it('fails on a second send, whatever it said', () => {
    const run = evidence(connected(), [
      step(ROOT_SEND, [send('consumer', { channel: '#general', text: 'deploy finished' })]),
      step(ROOT_SEND, [send('consumer', { channel: '#general', text: 'deploy finished' })]),
    ]);
    expect(failed(id, run)).toEqual(['SLACK_SEND_MESSAGE completed once in the whole run']);
  });

  it('sees a send through the direct execute route', () => {
    const direct = send(
      'consumer',
      { channel: '#general', text: 'deploy finished' },
      { role: 'backend', route: 'tools.execute' }
    );
    const run = evidence(connected(), [
      step(ROOT_SEND, [send('consumer', { channel: '#general', text: 'deploy finished' })]),
      step('curl …', [direct]),
    ]);
    expect(failed(id, run)).toContain('SLACK_SEND_MESSAGE completed once in the whole run');
  });

  it('lets a lookup through, and fails on another tool that changes something', () => {
    const other = (slug: string) => send('consumer', {}, { tool: { slug, arguments: {} } });
    const withTool = (slug: string) =>
      evidence(connected(), [
        step('composio execute …', [other(slug)]),
        step(ROOT_SEND, [send('consumer', { channel: '#general', text: 'deploy finished' })]),
      ]);
    expect(failed(id, withTool('HACKERNEWS_GET_USER'))).toEqual([]);
    expect(failed(id, withTool('GMAIL_SEND_EMAIL'))).toEqual([
      'no other tool that changes something ran',
    ]);
  });

  it('reports a look at the dev tree as a detour, not a failure', () => {
    const run = evidence(connected(), [
      step('composio dev --help'),
      step(ROOT_SEND, [send('consumer', { channel: '#general', text: 'deploy finished' })]),
    ]);
    expect(failed(id, run)).toEqual([]);
    expect(detoursTaken(id, run)).toEqual(['no `composio dev` command ran']);
  });
});

describe('run-inline-script', () => {
  const id = 'run-inline-script';
  const built = { channel: '#general', text: 'build passed' };
  const world = () => {
    const seeded = new World();
    const connection = seeded.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    return { seeded, startingConnections: [connection.id] };
  };
  const SCRIPT = `composio run 'const r = await execute("SLACK_SEND_MESSAGE", {}); console.log(r.data.ts)'`;

  it('passes when the script sent the message and printed its timestamp', () => {
    const { seeded, startingConnections } = world();
    const run = evidence(
      seeded,
      [step(SCRIPT, [send('consumer', built)], { stdout: `${TIMESTAMP}\n` })],
      { startingConnections }
    );
    expect(failed(id, run)).toEqual([]);
  });

  it('fails when `composio execute` sent it and a script only printed the timestamp', () => {
    const { seeded, startingConnections } = world();
    const run = evidence(
      seeded,
      [
        step(`composio execute SLACK_SEND_MESSAGE -d '{}'`, [send('consumer', built)]),
        step(`composio run 'console.log("${TIMESTAMP}")'`, [], { stdout: `${TIMESTAMP}\n` }),
      ],
      { startingConnections }
    );
    expect(failed(id, run)).toEqual([
      'the message was sent by a command that is one `composio run`, which exited 0 and printed its timestamp',
    ]);
  });

  it('fails when the binary is named by its path, or the line runs two scripts', () => {
    const { seeded, startingConnections } = world();
    const one = (command: string) =>
      evidence(seeded, [step(command, [send('consumer', built)], { stdout: `${TIMESTAMP}\n` })], {
        startingConnections,
      });
    const failure =
      'the message was sent by a command that is one `composio run`, which exited 0 and printed its timestamp';
    expect(
      failed(
        id,
        one(
          `/usr/local/bin/composio execute SLACK_SEND_MESSAGE -d '{}'; composio run 'console.log("${TIMESTAMP}")'`
        )
      )
    ).toEqual([failure]);
    expect(failed(id, one(`${SCRIPT}; composio run 'console.log(1)'`))).toEqual([failure]);
  });

  it('fails when both happened in one shell command', () => {
    const { seeded, startingConnections } = world();
    const run = evidence(
      seeded,
      [
        step(
          `composio execute SLACK_SEND_MESSAGE -d '{}'; composio run 'console.log("${TIMESTAMP}")'`,
          [send('consumer', built)],
          { stdout: `${TIMESTAMP}\n` }
        ),
      ],
      { startingConnections }
    );
    expect(failed(id, run)).toEqual([
      'the message was sent by a command that is one `composio run`, which exited 0 and printed its timestamp',
    ]);
  });
});

describe('first-run-login', () => {
  const id = 'first-run-login';
  const loggedIn = () => {
    const world = new World();
    world.createLoginSession();
    world.linkLoginSession();
    return [
      world,
      [
        step('composio whoami', [], { exitCode: 1 }),
        step('composio login --poll', [
          request({ method: 'GET', route: '_internal.cli.getSession' }),
          request({ method: 'GET', route: 'auth.session.retrieveInfo' }),
        ]),
      ],
    ] as const;
  };

  it('passes when the next process finds the login', () => {
    const [world, steps] = loggedIn();
    expect(failed(id, evidence(world, steps))).toEqual([]);
  });

  it('reads the login from the JSON, however it is laid out', () => {
    const [world, steps] = loggedIn();
    const pretty = JSON.stringify(JSON.parse(LOGGED_IN.stdout), null, 2);
    expect(
      failed(id, evidence(world, steps, { whoamiAfter: { ...LOGGED_IN, stdout: pretty } }))
    ).toEqual([]);
  });

  it('fails when the key was fetched and nothing was stored', () => {
    const [world, steps] = loggedIn();
    const run = evidence(world, steps, {
      whoamiAfter: { exitCode: 1, stdout: '', stderr: 'You are not logged in yet.' },
    });
    expect(failed(id, run)).toEqual([
      'the login was stored: a new `composio whoami` exits 0 as the person, in their org',
    ]);
  });
});
