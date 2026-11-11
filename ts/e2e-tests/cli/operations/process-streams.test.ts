/**
 * Process and streams: signals, a closed stdout pipe, and the three stream
 * contracts (stdout is data only; decoration, notices, and hints stay off it).
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { CONSUMER_PROJECT, CONSUMER_USER_ID, MEMBER } from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import { z } from 'zod';
import {
  clean,
  ExecutionResult,
  RIG_TIMEOUT_MS,
  runWithTerminal,
  SEARCH_SLACK,
  SearchResult,
  stdoutJson,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const Whoami = z.looseObject({ email: z.string() });
const UPDATE_NOTICE = 'Update available';
const PLUGIN_HINT = 'Tip: running under Claude Code';

describe('process: signals', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'signals' });
    await rig.login();
    // Nobody finishes the authorization, so `link` is still waiting when the signal arrives.
    rig.fake.world.linkCompletesAfterPolls = null;
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'signals');
    await rig.stop();
  });

  const interrupted = (command: string, signal: 'INT' | 'TERM') =>
    [
      `${command} > /tmp/sig.out 2> /tmp/sig.err &`,
      'pid=$!',
      'sleep 2',
      `kill -${signal} $pid`,
      'wait $pid',
      'echo "status=$?"',
      'echo "stdout-bytes=$(wc -c < /tmp/sig.out)"',
    ].join('\n');

  for (const { signal, status, toolkit } of [
    { signal: 'INT', status: 130, toolkit: 'slack' },
    { signal: 'TERM', status: 143, toolkit: 'github' },
  ] as const) {
    it(
      `SIG${signal} while \`link\` waits: exits ${status} with nothing on stdout`,
      async () => {
        const result = await rig.run(interrupted(`composio link ${toolkit}`, signal));
        expect(result.stdout).toContain(`status=${status}`);
        expect(result.stdout).toContain('stdout-bytes=0');
        // The link was requested once, and the interrupted wait did not request another.
        expect(
          result.requests.filter(entry => entry.route === 'toolRouter.session.link')
        ).toHaveLength(1);
      },
      TEST_TIMEOUT_MS
    );
  }

  it(
    'SIGINT while `run` executes a script: exits 130 and the script stops',
    async () => {
      const result = await rig.run(
        interrupted(
          `composio run 'await new Promise(resolve => setTimeout(resolve, 30000)); console.log("finished")'`,
          'INT'
        )
      );
      expect(result.stdout).toContain('status=130');
      expect(result.stdout).toContain('stdout-bytes=0');
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`link --no-browser` off a terminal prints the authorization URL on stderr before it waits',
    async () => {
      // Killed while it waits: whatever it printed, it printed before the authorization.
      const result = await rig.run('composio link gmail --no-browser', { timeoutSeconds: 6 });
      const connection = rig.fake.world.connections.at(-1);
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain(`${rig.fake.docker.http}/api/v3/s/${connection?.id}`);
      expect(result.stderr).toContain('For agents: Show the URL above to the user');
      expect(result.stderr).toContain('--no-wait');
      // stdout is for the connected account's JSON, which only comes once it is active.
      expect(result.stdout).toBe('');
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`link --no-wait` prints the authorization URL and returns at once',
    async () => {
      const result = await rig.run('composio link gmail --no-wait');
      expect(result.exitCode).toBe(0);
      const connection = rig.fake.world.connections.at(-1);
      expect(
        stdoutJson(result, z.looseObject({ status: z.string(), redirect_url: z.string() }))
      ).toMatchObject({
        status: 'pending',
        redirect_url: `${rig.fake.docker.http}/api/v3/s/${connection?.id}`,
      });
      expect(result.requests.map(entry => entry.route)).not.toContain('connectedAccounts.retrieve');
    },
    TEST_TIMEOUT_MS
  );
});

describe('streams', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'streams' });
    await rig.login();
    rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'streams');
    await rig.stop();
  });

  const seedUpdateAvailable = () =>
    rig.run(
      `printf '{"lastChecked":"%s","latestVersion":"99.0.0"}' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > ~/.composio/update-check.json`
    );

  it(
    'a reader that closes stdout early does not fail the command',
    async () => {
      const result = await rig.run(
        `{ composio search "send a slack message" "create a github issue" "send an email"; echo $? > /tmp/pipe.rc; } | head -1; cat /tmp/pipe.rc`
      );
      expect(result.stdout).toBe('{\n0\n');
      expect(result.stderr).toBe('');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'stdin: `-d -` reads the arguments from a pipe',
    async () => {
      const result = await rig.run('composio execute SLACK_SEND_MESSAGE -d -', {
        stdin: '{"channel":"general","text":"from stdin"}',
      });
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, ExecutionResult).data).toMatchObject({
        message: { text: 'from stdin' },
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'stdin: `-d -` with nothing on stdin fails without waiting for input',
    async () => {
      const result = await rig.run('composio execute SLACK_SEND_MESSAGE -d -', {
        timeoutSeconds: 10,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toContain('Invalid JSON input');
      expect(result.requests.map(entry => entry.route)).not.toContain('dashboard.execute');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'no terminal at all: stdout is the JSON and stderr is empty',
    async () => {
      const result = await rig.run('composio whoami');
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, Whoami).email).toBe(MEMBER.email);
      expect(result.stderr).toBe('');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'stdout piped, stderr a terminal: the JSON goes to the pipe, decoration to the terminal',
    async () => {
      const result = await runWithTerminal(rig, 'composio whoami > /tmp/tty.out');
      expect(result.exitCode).toBe(0);
      const piped = await rig.journey.readFile('/tmp/tty.out');
      expect(Whoami.parse(JSON.parse(piped)).email).toBe(MEMBER.email);
      expect(result.terminal).toContain(MEMBER.email);
      // The terminal shows the human rendering, not a second copy of the data.
      expect(result.terminal).not.toContain('"account_type"');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'stdout a terminal, stderr redirected: no data leaks onto the terminal',
    async () => {
      const result = await runWithTerminal(rig, 'composio whoami 2> /tmp/tty.err');
      expect(result.exitCode).toBe(0);
      expect(result.terminal).not.toContain('"account_type"');
      expect(await rig.journey.readFile('/tmp/tty.err')).toBe('');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'the update notice is never written to stdout',
    async () => {
      await seedUpdateAvailable();
      const piped = await rig.run('composio whoami');
      expect(stdoutJson(piped, Whoami).email).toBe(MEMBER.email);
      expect(piped.stdout).not.toContain(UPDATE_NOTICE);

      const withTerminal = await runWithTerminal(rig, 'composio whoami > /tmp/notice.out');
      expect(withTerminal.terminal).toContain(`${UPDATE_NOTICE}:`);
      expect(withTerminal.terminal).toContain('99.0.0');
      const data = await rig.journey.readFile('/tmp/notice.out');
      expect(Whoami.parse(JSON.parse(data)).email).toBe(MEMBER.email);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'the plugin hint under an agent host is written to stderr, never stdout',
    async () => {
      const result = await rig.run(`CLAUDECODE=1 ${SEARCH_SLACK}`);
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, SearchResult).results).toHaveLength(1);
      expect(result.stdout).not.toContain(PLUGIN_HINT);
      expect(clean(result.stderr)).toContain(PLUGIN_HINT);
    },
    TEST_TIMEOUT_MS
  );

  // CLI defect: `--human` renders through terminal decoration only, so off a terminal it prints nothing and exits 0.
  it.failing(
    '`search --human` off a terminal still prints the results',
    async () => {
      const result = await rig.run(`${SEARCH_SLACK} --human`);
      expect(result.exitCode).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('SLACK_SEND_MESSAGE');
    },
    TEST_TIMEOUT_MS
  );
});
