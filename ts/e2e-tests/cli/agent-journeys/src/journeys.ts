/**
 * The agent journeys: a user prompt, the state the CLI starts in, and what
 * must be true afterwards.
 *
 * A check reads the commands that ran, what they printed, and what the fake
 * backend received. None of them reads the model's prose except to see that it
 * stopped: a model can say "done" after every command failed.
 */

import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  GLOBAL_TEST_USER_ID,
  MEMBER,
  ORG,
  type JournalEntry,
  type World,
} from '@e2e-tests/cli-fake-backend';
import type { CliRig } from '@e2e-tests/cli-fake-backend/rig';
import { z } from 'zod';
import type { ExecutedCommand, ShellOutcome, Transcript } from './agent';

/** What a journey is graded on: what ran, what it printed, and what it changed. */
export interface Evidence {
  readonly transcript: Transcript;
  /** The fake's state once the model had stopped. */
  readonly world: World;
  /** What the fake received between the first and the last model turn. */
  readonly requests: ReadonlyArray<JournalEntry>;
  /** What the fake received while each of `transcript.commands` ran, in the same order. */
  readonly commandRequests: ReadonlyArray<ReadonlyArray<JournalEntry>>;
  /** Ids of the connections the journey's setup left behind, before the first model turn. */
  readonly startingConnections: ReadonlyArray<string>;
  /**
   * `composio whoami` in a new process, once the model had stopped: what the
   * next command on this machine would find. Its requests are not in `requests`.
   */
  readonly whoamiAfter: ShellOutcome;
}

export interface JourneyRun extends Evidence {
  readonly rig: CliRig;
}

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  /** What was seen instead, for the failure message. */
  readonly seen?: string;
}

export interface Journey {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  /** Directory the agent's shell starts in; defaults to the home directory. */
  readonly cwd?: string;
  readonly setup: (rig: CliRig) => Promise<void>;
  /**
   * What must hold however the model got there. These grade what the run
   * changed: what was executed, connected, and stored. A run that reached the
   * goal after trying the wrong thing still passes.
   */
  readonly checks: (run: Evidence) => ReadonlyArray<Check>;
  /**
   * What a confused agent does on the way: a command on the other tree, a
   * request to the other project. `ok: false` means the run took the detour.
   * Reported next to the checks and never a failure, so a wrong-tree rate can
   * be read separately from the success rate.
   */
  readonly detours?: (run: Evidence) => ReadonlyArray<Check>;
  /**
   * What must hold on the hand-authored path only: how the CLI answered the
   * specific commands that path scripts.
   */
  readonly scriptedChecks?: (run: Evidence) => ReadonlyArray<Check>;
}

export const DEV_DIRECTORY = '/work/app';

const check = (name: string, ok: boolean, seen?: unknown): Check => ({
  name,
  ok,
  seen:
    ok || seen === undefined ? undefined : typeof seen === 'string' ? seen : JSON.stringify(seen),
});

const isComposio = (command: ExecutedCommand, pattern: RegExp) => pattern.test(command.command);
// Where a `composio` invocation can start in a command line: at its start,
// after a separator, or after the directory of a binary named by its path.
const DEV_TREE = /(^|[;&|(\s/])composio\s+dev(\s|$)/;
const ROOT_EXECUTE = /(^|[;&|(\s/])composio\s+execute\s/;
/** A root `composio execute` that runs the tool, not one that only describes it. */
const ROOT_EXECUTE_RUNS =
  /(^|[;&|(\s/])composio\s+execute\s(?![^;&|]*--(?:get-schema|dry-run|help)\b)/;
const ROOT_LINK = /(^|[;&|(\s/])composio\s+link(\s|$)/;
const RUN = /(^|[;&|(\s/])composio\s+run\s/g;
const PLAYGROUND_EXECUTE = /composio\s+dev\s+(?:--\S+\s+\S+\s+)*playground-execute\s/;

const SEND = 'SLACK_SEND_MESSAGE';

/** Every tool execution that completed, whichever route ran it. */
const executions = (requests: ReadonlyArray<JournalEntry>) =>
  requests.flatMap(entry =>
    // A Dashboard execution answers 200 even when the tool was refused; the effect says it ran.
    entry.effect === 'tool-executed' && entry.tool ? [{ entry, tool: entry.tool }] : []
  );

const describeExecutions = (requests: ReadonlyArray<JournalEntry>) =>
  executions(requests).map(({ entry, tool }) => ({
    tool: tool.slug,
    project: entry.project,
    user: entry.userId,
    arguments: tool.arguments,
  }));

/** `general` and `#general` name the same channel. */
const channelName = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/^#/, '') : '';

/**
 * The person asked for one message. So one `SLACK_SEND_MESSAGE` completed in
 * the whole run, on any project and through any route, and it is that
 * message: a second send, a send on the other project, another channel, and
 * other words each fail a check of their own. A lookup beside it changes
 * nothing and is let through; any other tool that changes something is not.
 */
const sentOnce = (
  run: Evidence,
  expected: {
    text: string;
    project: string;
    userId: string;
    /**
     * Whether the request itself must name the project. A developer command
     * sends it; a consumer execution names none and the Dashboard resolves it.
     */
    scope: 'named' | 'resolved';
  }
): ReadonlyArray<Check> => {
  const all = executions(run.requests);
  const sends = all.filter(({ tool }) => tool.slug === SEND);
  const otherChanges = all.filter(
    ({ tool }) => tool.slug !== SEND && run.world.findTool(tool.slug)?.readOnly !== true
  );
  const seen = describeExecutions(run.requests);
  const everySend = (holds: (execution: (typeof sends)[number]) => boolean) =>
    sends.length > 0 && sends.every(holds);
  return [
    check(`${SEND} completed once in the whole run`, sends.length === 1, seen),
    check(
      `it ran on the ${expected.project} project, as ${expected.userId}`,
      everySend(
        ({ entry }) =>
          entry.project === expected.project &&
          entry.userId === expected.userId &&
          (entry.requestedProject === expected.project ||
            (expected.scope === 'resolved' && entry.requestedProject === null))
      ),
      seen
    ),
    check(
      'it went to #general',
      everySend(({ tool }) => channelName(tool.arguments.channel) === 'general'),
      seen
    ),
    check(
      `its text was exactly "${expected.text}"`,
      everySend(
        ({ tool }) =>
          typeof tool.arguments.text === 'string' && tool.arguments.text.trim() === expected.text
      ),
      seen
    ),
    check('no other tool that changes something ran', otherChanges.length === 0, seen),
  ];
};

/** A connection made during the run on a project the task never involved. */
const connectedOnlyOn = (run: Evidence, project: string): Check => {
  const stray = run.world.connections.filter(
    connection =>
      connection.status === 'ACTIVE' &&
      connection.projectLabel !== project &&
      !run.startingConnections.includes(connection.id)
  );
  return check(
    `no account was connected outside the ${project} project`,
    stray.length === 0,
    stray.map(connection => `${connection.toolkit} on ${connection.projectLabel}`)
  );
};

const ranNo = (run: Evidence, name: string, pattern: RegExp): Check => {
  const matching = run.transcript.commands.filter(command => isComposio(command, pattern));
  return check(
    name,
    matching.length === 0,
    matching.map(command => command.command)
  );
};

/** What `composio whoami` prints on stdout off a terminal, as far as a login is concerned. */
const Whoami = z.looseObject({
  account_type: z.string(),
  email: z.string(),
  current_org_name: z.string(),
});

/** The login a `composio whoami` reported, or `undefined` when it reported none. */
const loginReportedBy = (outcome: ShellOutcome) => {
  if (outcome.exitCode !== 0) return undefined;
  try {
    return Whoami.safeParse(JSON.parse(outcome.stdout)).data;
  } catch {
    return undefined;
  }
};

const lastCommandSucceeded = (run: Evidence, pattern: RegExp): boolean => {
  const matching = run.transcript.commands.filter(command => isComposio(command, pattern));
  return matching.at(-1)?.exitCode === 0;
};

const stoppedByItself = (run: Evidence): Check =>
  check(
    'the model finished by itself, within the turn limit',
    run.transcript.stop === 'finished',
    run.transcript.stop
  );

const loginRig = async (rig: CliRig): Promise<void> => {
  await rig.login();
};

const developerRig = async (rig: CliRig): Promise<void> => {
  await rig.login();
  const result = await rig.run(
    `mkdir -p ${DEV_DIRECTORY} && cd ${DEV_DIRECTORY} && composio dev init --yes --no-browser`
  );
  if (result.exitCode !== 0) throw new Error(`composio dev init failed: ${result.stderr}`);
};

/** Requests that acted on a project other than the one the task is about. */
const requestsOutside = (run: Evidence, project: string): Check => {
  const outside = run.requests.filter(
    entry =>
      (entry.role === 'backend' || entry.role === 'dashboard') &&
      entry.project !== null &&
      entry.project !== project
  );
  return check(
    `every request that named a project named the ${project} project`,
    outside.length === 0,
    [...new Set(outside.map(entry => `${entry.route} on ${entry.project}`))]
  );
};

/** What a developer task looks like when the agent reaches for the root tree. */
const rootTreeDetours = (run: Evidence): ReadonlyArray<Check> => [
  ranNo(run, 'no root `composio execute` tried to run the tool', ROOT_EXECUTE_RUNS),
  ranNo(run, 'no root `composio link` ran', ROOT_LINK),
  check(
    'nothing was executed or linked on the consumer project, completed or not',
    !run.requests.some(
      entry =>
        entry.project === CONSUMER_PROJECT.label &&
        (entry.route === 'dashboard.execute' ||
          entry.route === 'toolRouter.session.execute' ||
          entry.route === 'toolRouter.session.link')
    )
  ),
];

/** What a consumer task looks like when the agent reaches for the dev tree. */
const devTreeDetours = (run: Evidence): ReadonlyArray<Check> => [
  ranNo(run, 'no `composio dev` command ran', DEV_TREE),
  requestsOutside(run, CONSUMER_PROJECT.label),
];

export const JOURNEYS: ReadonlyArray<Journey> = [
  {
    id: 'consumer-slack-message',
    title: 'consumer task: send a Slack message from an unconnected account',
    prompt: 'Send a Slack message to the #general channel that says: deploy finished',
    setup: loginRig,
    checks: run => [
      stoppedByItself(run),
      check(
        'the last `composio execute` exited 0',
        lastCommandSucceeded(run, ROOT_EXECUTE),
        run.transcript.commands.map(command => `${command.exitCode} ${command.command}`)
      ),
      ...sentOnce(run, {
        text: 'deploy finished',
        project: CONSUMER_PROJECT.label,
        userId: CONSUMER_USER_ID,
        scope: 'resolved',
      }),
      check(
        'the account was linked on the consumer project',
        run.world.activeConnection(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack') !== undefined
      ),
      connectedOnlyOn(run, CONSUMER_PROJECT.label),
    ],
    detours: devTreeDetours,
  },
  {
    id: 'developer-auth-configs-and-execute',
    title: 'developer task: list auth configs and run a tool as the test user',
    prompt:
      'I am building an app on Composio. In my developer project, list the auth configs, then execute SLACK_SEND_MESSAGE as my test user to post "hello from dev" in #general.',
    cwd: DEV_DIRECTORY,
    setup: async rig => {
      await developerRig(rig);
      rig.fake.world.connect(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack');
    },
    checks: run => [
      stoppedByItself(run),
      check(
        '`composio dev auth-configs list` ran and exited 0',
        lastCommandSucceeded(run, /composio\s+dev\s+auth-configs\s+list/),
        run.transcript.commands.map(command => `${command.exitCode} ${command.command}`)
      ),
      check(
        'the auth configs were read from the developer project',
        run.requests.some(
          entry =>
            entry.route === 'authConfigs.list' &&
            entry.status === 200 &&
            entry.project === DEVELOPER_PROJECT.label
        )
      ),
      ...sentOnce(run, {
        text: 'hello from dev',
        project: DEVELOPER_PROJECT.label,
        userId: GLOBAL_TEST_USER_ID,
        scope: 'named',
      }),
      check(
        'it ran through `composio dev playground-execute`',
        lastCommandSucceeded(run, PLAYGROUND_EXECUTE)
      ),
      connectedOnlyOn(run, DEVELOPER_PROJECT.label),
    ],
    detours: rootTreeDetours,
  },
  {
    id: 'developer-execute-unconnected',
    title: 'tree confusion: a developer task that needs a connection first',
    prompt:
      'In my Composio developer project, execute SLACK_SEND_MESSAGE as my test user to post "hello from dev" in #general.',
    cwd: DEV_DIRECTORY,
    setup: developerRig,
    checks: run => [
      stoppedByItself(run),
      ...sentOnce(run, {
        text: 'hello from dev',
        project: DEVELOPER_PROJECT.label,
        userId: GLOBAL_TEST_USER_ID,
        scope: 'named',
      }),
      check(
        'the account was linked on the developer project for the test user',
        run.world.activeConnection(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack') !==
          undefined
      ),
      // The confusion this journey exists for: `composio link` connects the
      // consumer user, the person approves it, and the developer task is no nearer.
      connectedOnlyOn(run, DEVELOPER_PROJECT.label),
      check(
        'the last `composio dev playground-execute` exited 0',
        lastCommandSucceeded(run, PLAYGROUND_EXECUTE),
        run.transcript.commands.map(command => `${command.exitCode} ${command.command}`)
      ),
    ],
    detours: rootTreeDetours,
    scriptedChecks: run => {
      const [wrongTree, firstAttempt] = run.transcript.commands;
      return [
        // A command from the root tree's vocabulary on the dev tree: recoverable.
        check(
          '`composio dev execute` exits 1 with nothing on stdout',
          wrongTree?.exitCode === 1 && wrongTree.stdout === '',
          wrongTree
        ),
        check(
          'its stderr names the unknown subcommand',
          wrongTree?.stderr.includes('Unknown subcommand "execute" for "composio dev"') === true,
          wrongTree?.stderr.slice(-300)
        ),
        check(
          'the help printed with it lists the real command, and both survive truncation',
          wrongTree?.payload.includes('playground-execute') === true &&
            wrongTree.payload.includes('Unknown subcommand'),
          wrongTree?.payload.length
        ),
        // The not-connected message names the link of the tree it was raised
        // on. A root-tree link would connect the consumer user and fix nothing.
        check(
          'the unconnected `playground-execute` names the dev-tree link',
          firstAttempt?.exitCode === 1 &&
            firstAttempt.stdout.includes('Run `composio dev connected-accounts link slack`') &&
            !firstAttempt.stdout.includes('`composio link slack`'),
          firstAttempt?.stdout
        ),
      ];
    },
  },
  {
    id: 'first-run-login',
    title: 'first run: find out the CLI is not logged in, and log in',
    prompt: 'Check whether the Composio CLI on this machine is logged in. If it is not, log in.',
    setup: async () => {},
    checks: run => {
      const whoami = run.transcript.commands.filter(command =>
        isComposio(command, /composio\s+whoami/)
      );
      const stored = loginReportedBy(run.whoamiAfter);
      return [
        stoppedByItself(run),
        check(
          'the first `composio whoami` reported no login (exit 1)',
          whoami[0]?.exitCode === 1,
          whoami.map(command => command.exitCode)
        ),
        check(
          'exactly one CLI login session was created, and it was linked',
          run.world.loginSessions.length === 1 && run.world.loginSessions[0]?.status === 'linked',
          run.world.loginSessions
        ),
        check(
          'the login completed: the user API key was fetched for the linked session',
          run.requests.some(
            entry => entry.route === '_internal.cli.getSession' && entry.status === 200
          ) &&
            run.requests.some(
              entry => entry.route === 'auth.session.retrieveInfo' && entry.keyKnown
            )
        ),
        // The requests above happen in the process that logged in. This is the
        // next process: it finds the login only if it was stored.
        check(
          'the login was stored: a new `composio whoami` exits 0 as the person, in their org',
          stored?.account_type === 'human' &&
            stored.email === MEMBER.email &&
            stored.current_org_name === ORG.name,
          run.whoamiAfter
        ),
        check(
          'no agent account was signed up in place of the person',
          !run.requests.some(entry => entry.route === 'agents.signup')
        ),
      ];
    },
  },
  {
    id: 'run-inline-script',
    title: '`composio run`: one inline script that executes a tool',
    prompt:
      'Use a single `composio run` inline script to send "build passed" to #general on Slack and print the timestamp of the sent message.',
    setup: async rig => {
      await rig.login();
      rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    },
    checks: run => {
      // The commands during which a tool execution completed.
      const sending = run.transcript.commands.filter(
        (_, index) => executions(run.commandRequests[index] ?? []).length > 0
      );
      return [
        stoppedByItself(run),
        ...sentOnce(run, {
          text: 'build passed',
          project: CONSUMER_PROJECT.label,
          userId: CONSUMER_USER_ID,
          scope: 'resolved',
        }),
        // The send and the timestamp belong to one command, and that command
        // is the script: not `composio execute` followed by a script that
        // prints what it was told. This reads the command's text, so it holds
        // for the ways a shell line names `composio`, not for an alias or a
        // wrapper script.
        check(
          'the message was sent by a command that is one `composio run`, which exited 0 and printed its timestamp',
          sending.length === 1 &&
            sending.every(
              command =>
                (command.command.match(RUN) ?? []).length === 1 &&
                !isComposio(command, ROOT_EXECUTE_RUNS) &&
                !isComposio(command, PLAYGROUND_EXECUTE) &&
                command.exitCode === 0 &&
                command.stdout.includes('1767225600.000100')
            ),
          sending.map(command => `${command.exitCode} ${command.command.slice(0, 160)}`)
        ),
        connectedOnlyOn(run, CONSUMER_PROJECT.label),
      ];
    },
    detours: devTreeDetours,
  },
];

export const journeyById = (id: string): Journey => {
  const journey = JOURNEYS.find(candidate => candidate.id === id);
  if (!journey) {
    throw new Error(
      `Unknown journey "${id}". Known: ${JOURNEYS.map(candidate => candidate.id).join(', ')}`
    );
  }
  return journey;
};
