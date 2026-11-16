/**
 * Login and session: the CLI login session (created, polled, linked), the
 * stored login it leaves on disk, `whoami`, `logout`, and the session
 * artifact directory.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  FOREIGN_USER_API_KEY,
  GLOBAL_TEST_USER_ID,
  MEMBER,
  ORG,
  USER_API_KEY,
} from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import { z } from 'zod';
import {
  clean,
  commandRequests,
  readStoredLogin,
  RIG_TIMEOUT_MS,
  routesOf,
  stdoutJson,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const NOT_LOGGED_IN = 'You are not logged in yet. Please run `composio login`.';

const Whoami = z.looseObject({
  account_type: z.string(),
  email: z.string(),
  current_org_name: z.string(),
});

const PendingLogin = z.looseObject({ key: z.string(), loginUrl: z.string() });

const PollLogin = z.looseObject({
  email: z.string(),
  current_org: z.object({ id: z.string(), name: z.string() }),
  organizations: z.array(z.looseObject({ id: z.string(), selected: z.boolean() })),
});

describe('login session: browser login completed by polling', () => {
  let rig: CliRig;
  const home = () => `${rig.journey.home}/.composio`;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'login-poll' });
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'login-poll');
    await rig.stop();
  });

  it(
    'first run: `whoami` reports no login without calling the backend',
    async () => {
      const result = await rig.run('composio whoami');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toBe(NOT_LOGGED_IN);
      expect(commandRequests(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'headless `login` creates a pending session and prints how to finish it',
    async () => {
      const result = await rig.run('composio login');
      expect(result.exitCode).toBe(0);
      expect(routesOf(result)).toEqual(['_internal.cli.createSession']);

      const session = rig.fake.world.loginSessions.at(-1);
      expect(session?.status).toBe('pending');
      const stdout = clean(result.stdout);
      expect(stdout).toContain(`${rig.fake.docker.https}?cliKey=${session?.id}`);
      expect(stdout).toContain('composio login --poll');

      const pending = PendingLogin.parse(
        JSON.parse(await rig.journey.readFile(`${home()}/pending-login-session.json`))
      );
      expect(pending.key).toBe(session?.id ?? '');
      expect((await readStoredLogin(rig)).api_key).toBeNull();
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`login --poll` keeps polling while nobody approved the session',
    async () => {
      const result = await rig.run('composio login --poll --no-skill-install', {
        timeoutSeconds: 8,
      });
      // 124: still waiting when the test's own time limit ended it.
      expect(result.exitCode).toBe(124);
      expect(result.stdout).toBe('');
      const polls = result.requests.filter(entry => entry.route === '_internal.cli.getSession');
      expect(polls.length).toBeGreaterThanOrEqual(2);
      expect((await readStoredLogin(rig)).api_key).toBeNull();
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`login --poll` stores the login once the session is linked',
    async () => {
      rig.fake.world.linkLoginSession();
      const result = await rig.run('composio login --poll --no-skill-install');
      expect(result.exitCode).toBe(0);

      const summary = stdoutJson(result, PollLogin);
      expect(summary.email).toBe(MEMBER.email);
      expect(summary.current_org).toEqual({ id: ORG.id, name: ORG.name });
      expect(summary.organizations.filter(org => org.selected).map(org => org.id)).toEqual([
        ORG.id,
      ]);

      expect(await readStoredLogin(rig)).toMatchObject({
        api_key: USER_API_KEY,
        base_url: rig.fake.docker.http,
        web_url: rig.fake.docker.https,
        org_id: ORG.id,
        test_user_id: GLOBAL_TEST_USER_ID,
      });
      const leftovers = await rig.run(`ls ${home()}`);
      expect(leftovers.stdout).not.toContain('pending-login-session.json');
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`whoami` prints the account as JSON on stdout and nothing on stderr',
    async () => {
      const result = await rig.run('composio whoami');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(stdoutJson(result, Whoami)).toMatchObject({
        account_type: 'human',
        email: MEMBER.email,
        current_org_name: ORG.name,
      });
      expect(commandRequests(result).every(entry => entry.keyClass === 'user')).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`login` when already logged in changes nothing and creates no session',
    async () => {
      const before = await readStoredLogin(rig);
      const result = await rig.run('composio login');
      expect(result.exitCode).toBe(0);
      expect(commandRequests(result)).toEqual([]);
      expect(await readStoredLogin(rig)).toEqual(before);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`logout` forgets the key, and `whoami` then reports no login',
    async () => {
      const logout = await rig.run('composio logout');
      expect(logout.exitCode).toBe(0);
      expect(logout.stdout).toBe('');
      expect((await readStoredLogin(rig)).api_key).toBeNull();

      const whoami = await rig.run('composio whoami');
      expect(whoami.exitCode).toBe(1);
      expect(clean(whoami.stderr)).toBe(NOT_LOGGED_IN);
      expect(commandRequests(whoami)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );
});

describe('login session: completed with an explicit session key', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'login-key' });
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'login-key');
    await rig.stop();
  });

  it(
    '`login --key` on a session nobody approved fails without storing a login',
    async () => {
      await rig.run('composio login --no-wait');
      const session = rig.fake.world.loginSessions.at(-1);
      const result = await rig.run(`composio login --key ${session?.id} --no-wait`);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toContain('Session not yet linked');
      expect((await readStoredLogin(rig)).api_key).toBeNull();
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`login --key` on a linked session stores the login',
    async () => {
      const session = rig.fake.world.linkLoginSession();
      const result = await rig.run(
        `composio login --key ${session.id} --no-wait --no-skill-install`
      );
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, z.looseObject({ email: z.string(), org_id: z.string() }))).toEqual(
        expect.objectContaining({ email: MEMBER.email, org_id: ORG.id })
      );
      expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`login --key` with an unknown session names the command that gets a new one',
    async () => {
      await rig.run('composio logout');
      const result = await rig.run('composio login --key no-such-session --no-wait');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toBe(
        'Session not found or expired. Run `composio login --no-wait` to get a new session.'
      );
      expect((await readStoredLogin(rig)).api_key).toBeNull();
    },
    TEST_TIMEOUT_MS
  );
});

describe('login session: a user API key given directly', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'login-direct' });
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'login-direct');
    await rig.stop();
  });

  it(
    'a key the backend rejects is not stored',
    async () => {
      const result = await rig.run(
        `composio login --user-api-key ${FOREIGN_USER_API_KEY} --no-skill-install`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toContain('Invalid API key');
      const stored = await rig.run('cat ~/.composio/user_data.json');
      expect(stored.stdout).not.toContain(FOREIGN_USER_API_KEY);
    },
    TEST_TIMEOUT_MS
  );

  // CLI defect: a rejected key at login is printed as a defect report with an empty title, not as an expected failure.
  it.failing(
    'a key the backend rejects is reported as an expected failure, without a defect report',
    async () => {
      const result = await rig.run(
        `composio login --user-api-key ${FOREIGN_USER_API_KEY} --no-skill-install`
      );
      expect(clean(result.stderr)).not.toContain('💥');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'an accepted key is stored with the org and the global test user',
    async () => {
      const result = await rig.login();
      expect(result.exitCode).toBe(0);
      expect(await readStoredLogin(rig)).toMatchObject({
        api_key: USER_API_KEY,
        org_id: ORG.id,
        test_user_id: GLOBAL_TEST_USER_ID,
      });
    },
    TEST_TIMEOUT_MS
  );
});

describe('session artifacts', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'artifacts' });
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'artifacts');
    await rig.stop();
  });

  it(
    '`artifacts cwd` prints one absolute directory, without a login or a request',
    async () => {
      const result = await rig.run('composio artifacts cwd');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toMatch(/^\/\S+$/);
      expect(commandRequests(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`artifacts cwd` is stable for a directory and follows COMPOSIO_SESSION_DIR',
    async () => {
      const first = await rig.run('composio artifacts cwd');
      const second = await rig.run('composio artifacts cwd');
      expect(second.stdout).toBe(first.stdout);

      const overridden = await rig.run(
        'COMPOSIO_SESSION_DIR=/tmp/e2e-sessions composio artifacts cwd'
      );
      expect(overridden.exitCode).toBe(0);
      expect(overridden.stdout.trim().startsWith('/tmp/e2e-sessions')).toBe(true);
    },
    TEST_TIMEOUT_MS
  );
});
