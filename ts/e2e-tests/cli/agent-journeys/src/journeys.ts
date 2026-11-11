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
  USER_API_KEY,
  type JournalEntry,
} from '@e2e-tests/cli-fake-backend';
import type { CliRig } from '@e2e-tests/cli-fake-backend/rig';
import { z } from 'zod';
import type { ExecutedCommand, Transcript } from './agent';

export interface JourneyRun {
  readonly transcript: Transcript;
  readonly rig: CliRig;
  /** What the fake received between the first and the last model turn. */
  readonly requests: ReadonlyArray<JournalEntry>;
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
  /** What must hold however the model got there. */
  readonly checks: (run: JourneyRun) => ReadonlyArray<Check>;
  /**
   * What must hold on the hand-authored path only: how the CLI answered the
   * specific commands that path scripts.
   */
  readonly scriptedChecks?: (run: JourneyRun) => ReadonlyArray<Check>;
}

export const DEV_DIRECTORY = '/work/app';

const check = (name: string, ok: boolean, seen?: unknown): Check => ({
  name,
  ok,
  seen:
    ok || seen === undefined ? undefined : typeof seen === 'string' ? seen : JSON.stringify(seen),
});

const isComposio = (command: ExecutedCommand, pattern: RegExp) => pattern.test(command.command);
const DEV_TREE = /(^|[;&|(\s])composio\s+dev(\s|$)/;
const ROOT_EXECUTE = /(^|[;&|(\s])composio\s+execute\s/;
const PLAYGROUND_EXECUTE = /composio\s+dev\s+(?:--\S+\s+\S+\s+)*playground-execute\s/;

const acted = (requests: ReadonlyArray<JournalEntry>) =>
  requests.filter(entry => entry.role === 'backend' || entry.role === 'dashboard');

const ExecuteBody = z.looseObject({
  tool_slug: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
const DashboardBody = z.object({ json: ExecuteBody });

/** The arguments of each tool execution that completed, read from the request bodies. */
const completedExecutions = (requests: ReadonlyArray<JournalEntry>) =>
  requests.flatMap(entry => {
    // A Dashboard execution answers 200 even when the tool was refused; the effect says it ran.
    if (entry.effect !== 'tool-executed') return [];
    const body =
      entry.route === 'dashboard.execute'
        ? DashboardBody.safeParse(entry.body).data?.json
        : entry.route === 'toolRouter.session.execute'
          ? ExecuteBody.safeParse(entry.body).data
          : undefined;
    return body ? [{ entry, slug: body.tool_slug, arguments: body.arguments }] : [];
  });

const ranTool = (run: JourneyRun, text: string, project: string, userId: string) =>
  completedExecutions(run.requests).filter(
    execution =>
      execution.slug === 'SLACK_SEND_MESSAGE' &&
      String(execution.arguments.text ?? '').includes(text) &&
      execution.entry.project === project &&
      execution.entry.userId === userId
  );

const lastCommandSucceeded = (run: JourneyRun, pattern: RegExp): boolean => {
  const matching = run.transcript.commands.filter(command => isComposio(command, pattern));
  return matching.at(-1)?.exitCode === 0;
};

const stoppedByItself = (run: JourneyRun): Check =>
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

export const JOURNEYS: ReadonlyArray<Journey> = [
  {
    id: 'consumer-slack-message',
    title: 'consumer task: send a Slack message from an unconnected account',
    prompt: 'Send a Slack message to the #general channel that says: deploy finished',
    setup: loginRig,
    checks: run => {
      const sent = ranTool(run, 'deploy finished', CONSUMER_PROJECT.label, CONSUMER_USER_ID);
      const projects = new Set(acted(run.requests).map(entry => entry.project));
      return [
        stoppedByItself(run),
        check(
          'the last `composio execute` exited 0',
          lastCommandSucceeded(run, ROOT_EXECUTE),
          run.transcript.commands.map(command => `${command.exitCode} ${command.command}`)
        ),
        check(
          'the message was sent once, on the consumer project, as the consumer user',
          sent.length === 1 &&
            run.rig.fake.world.activeConnection(
              CONSUMER_PROJECT.label,
              CONSUMER_USER_ID,
              'slack'
            ) !== undefined,
          completedExecutions(run.requests).map(execution => execution.arguments)
        ),
        check(
          'the account was linked on the consumer project',
          run.requests.some(
            entry =>
              entry.route === 'toolRouter.session.link' &&
              entry.project === CONSUMER_PROJECT.label &&
              entry.userId === CONSUMER_USER_ID
          )
        ),
        check(
          'no `composio dev` command ran',
          !run.transcript.commands.some(command => isComposio(command, DEV_TREE)),
          run.transcript.commands.map(command => command.command)
        ),
        check(
          'every request that named a project named the consumer project',
          [...projects].every(project => project === null || project === CONSUMER_PROJECT.label),
          [...projects]
        ),
      ];
    },
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
    checks: run => {
      const sent = ranTool(run, 'hello from dev', DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID);
      return [
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
        check(
          'the tool ran once on the developer project as the global test user',
          sent.length === 1,
          completedExecutions(run.requests).map(execution => ({
            project: execution.entry.project,
            user: execution.entry.userId,
            arguments: execution.arguments,
          }))
        ),
        check(
          'it ran through `composio dev playground-execute`',
          lastCommandSucceeded(run, PLAYGROUND_EXECUTE)
        ),
        check(
          'nothing was executed or linked on the consumer project',
          !run.requests.some(
            entry =>
              entry.project === CONSUMER_PROJECT.label &&
              (entry.route === 'dashboard.execute' || entry.route === 'toolRouter.session.link')
          )
        ),
      ];
    },
  },
  {
    id: 'developer-execute-unconnected',
    title: 'tree confusion: a developer task that needs a connection first',
    prompt:
      'In my Composio developer project, execute SLACK_SEND_MESSAGE as my test user to post "hello from dev" in #general.',
    cwd: DEV_DIRECTORY,
    setup: developerRig,
    checks: run => {
      const sent = ranTool(run, 'hello from dev', DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID);
      return [
        stoppedByItself(run),
        check(
          'the tool ran once on the developer project as the global test user',
          sent.length === 1,
          completedExecutions(run.requests).map(execution => ({
            project: execution.entry.project,
            user: execution.entry.userId,
          }))
        ),
        check(
          'the account was linked on the developer project for the test user',
          run.rig.fake.world.activeConnection(
            DEVELOPER_PROJECT.label,
            GLOBAL_TEST_USER_ID,
            'slack'
          ) !== undefined
        ),
        check(
          'the last `composio dev playground-execute` exited 0',
          lastCommandSucceeded(run, PLAYGROUND_EXECUTE),
          run.transcript.commands.map(command => `${command.exitCode} ${command.command}`)
        ),
      ];
    },
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
        check(
          'following it links nothing on the consumer project',
          !run.requests.some(
            entry =>
              entry.route === 'toolRouter.session.link' && entry.project === CONSUMER_PROJECT.label
          )
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
      return [
        stoppedByItself(run),
        check(
          'the first `composio whoami` reported no login (exit 1)',
          whoami[0]?.exitCode === 1,
          whoami.map(command => command.exitCode)
        ),
        check(
          'exactly one CLI login session was created, and it was linked',
          run.rig.fake.world.loginSessions.length === 1 &&
            run.rig.fake.world.loginSessions[0]?.status === 'linked',
          run.rig.fake.world.loginSessions
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
      const runs = run.transcript.commands.filter(command =>
        isComposio(command, /composio\s+run\s/)
      );
      const sent = ranTool(run, 'build passed', CONSUMER_PROJECT.label, CONSUMER_USER_ID);
      return [
        stoppedByItself(run),
        check(
          'a `composio run` command exited 0 and printed the message timestamp',
          runs.some(
            command => command.exitCode === 0 && command.stdout.includes('1767225600.000100')
          ),
          runs.map(command => `${command.exitCode} ${command.stdout.slice(0, 120)}`)
        ),
        check(
          'the message was sent once, on the consumer project, as the consumer user',
          sent.length === 1,
          completedExecutions(run.requests).map(execution => execution.arguments)
        ),
      ];
    },
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

/** The stored login after the first-run journey, for the suite to assert on disk state. */
export const EXPECTED_STORED_KEY = USER_API_KEY;
