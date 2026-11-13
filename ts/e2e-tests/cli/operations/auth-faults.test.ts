/**
 * Auth faults: no key, a key the backend rejects, a key sent to a backend that
 * did not issue it, and a key of the wrong class.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import {
  DEVELOPER_PROJECT,
  FOREIGN_USER_API_KEY,
  startFakeComposio,
  USER_API_KEY,
  type FakeComposio,
} from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import {
  clean,
  commandRequests,
  EXECUTE_SLACK,
  PLAYGROUND_EXECUTE_SLACK,
  readStoredLogin,
  RIG_TIMEOUT_MS,
  SEARCH_SLACK,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const NOT_LOGGED_IN = 'You are not logged in yet. Please run `composio login`.';

describe('auth faults: no key', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'auth-none' });
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'auth-none');
    await rig.stop();
  });

  for (const command of [
    SEARCH_SLACK,
    EXECUTE_SLACK,
    'composio link slack',
    'composio connections list',
    'composio dev auth-configs list',
    PLAYGROUND_EXECUTE_SLACK,
    'composio dev connected-accounts link slack',
  ]) {
    it(
      `\`${command.split(' -d ')[0]}\` names \`composio login\` and sends nothing`,
      async () => {
        const result = await rig.run(command);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(clean(result.stderr)).toBe(NOT_LOGGED_IN);
        expect(commandRequests(result)).toEqual([]);
      },
      TEST_TIMEOUT_MS
    );
  }

  it(
    'a key from COMPOSIO_USER_API_KEY alone has no org: the command says how to get one',
    async () => {
      const result = await rig.run(`COMPOSIO_USER_API_KEY=${USER_API_KEY} ${SEARCH_SLACK}`);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toBe(
        'No current org configured. Run `composio login` or `composio orgs switch`.'
      );
      expect(commandRequests(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );
});

describe('auth faults: a stored key the backend stops accepting', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'auth-rejected' });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterEach(() => rig.fake.faults.clear());

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'auth-rejected');
    await rig.stop();
  });

  const reject = () =>
    rig.fake.faults.inject({
      route: /^(GET|POST) \/api\//,
      fault: {
        kind: 'status',
        status: 401,
        slug: 'Auth_InvalidApiKey',
        message: 'Invalid API key',
      },
    });

  for (const command of [SEARCH_SLACK, EXECUTE_SLACK, 'composio connections list']) {
    it(
      `\`${command.split(' -d ')[0]}\`: exit 1, the rejection on stderr, the login left in place`,
      async () => {
        reject();
        const result = await rig.run(command);
        expect(result.exitCode).toBe(1);
        expect(`${clean(result.stdout)}\n${clean(result.stderr)}`).toContain('Invalid API key');
        expect(commandRequests(result).length).toBeGreaterThan(0);
        expect(commandRequests(result).every(entry => entry.status === 401)).toBe(true);
        expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
      },
      TEST_TIMEOUT_MS
    );
  }

  it(
    'a rejected stored key names `composio login` as the way out',
    async () => {
      reject();
      const result = await rig.run(SEARCH_SLACK);
      expect(clean(result.stderr)).toContain('composio login');
    },
    TEST_TIMEOUT_MS
  );

  // CLI defect: `whoami` answers a 401 with exit 0 and a JSON object of nulls, so "check the login with whoami" passes on a dead key.
  it.failing(
    '`whoami` fails when the backend rejects the stored key',
    async () => {
      reject();
      const result = await rig.run('composio whoami');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
    },
    TEST_TIMEOUT_MS
  );
});

describe('auth faults: a key sent to another backend', () => {
  let rig: CliRig;
  let elsewhere: FakeComposio;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'auth-mismatch' });
    // A deployment that issued its own key and has never seen this rig's.
    elsewhere = await startFakeComposio({ userApiKey: FOREIGN_USER_API_KEY });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'auth-mismatch');
    await elsewhere.close();
    await rig.stop();
  });

  it(
    'COMPOSIO_BASE_URL pointing away from the issuer warns on stderr before sending the key',
    async () => {
      const result = await rig.run(`COMPOSIO_BASE_URL=${elsewhere.docker.http} composio whoami`);
      const stderr = clean(result.stderr);
      expect(stderr).toContain(
        `COMPOSIO_BASE_URL sends your stored API key to ${elsewhere.docker.http}, but it was issued by ${rig.fake.docker.http}.`
      );
      expect(stderr).toContain('composio logout && composio login');
      expect(result.stdout).not.toContain('COMPOSIO_BASE_URL');
      // The stored key did go to the other backend, which rejected it; nothing went to the issuer.
      const received = elsewhere.journal.entries().filter(entry => entry.role === 'backend');
      expect(received.length).toBeGreaterThan(0);
      expect(received.every(entry => entry.keyClass === 'user' && !entry.keyKnown)).toBe(true);
      expect(received.every(entry => entry.status === 401)).toBe(true);
      expect(commandRequests(result)).toEqual([]);
      expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a command that needs the backend fails there with the rejection on stderr',
    async () => {
      const result = await rig.run(`COMPOSIO_BASE_URL=${elsewhere.docker.http} ${SEARCH_SLACK}`);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      const stderr = clean(result.stderr);
      expect(stderr).toContain('COMPOSIO_BASE_URL sends your stored API key');
      expect(stderr).toContain('Invalid API key');
      expect(commandRequests(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );
});

describe('auth faults: a key of the wrong class', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'auth-class' });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'auth-class');
    await rig.stop();
  });

  it(
    'a project API key in the user-key slot is sent as a user key and rejected',
    async () => {
      const result = await rig.run(
        `COMPOSIO_USER_API_KEY=${DEVELOPER_PROJECT.apiKey} composio whoami`
      );
      const sent = commandRequests(result);
      expect(sent.length).toBeGreaterThan(0);
      // The journal classifies by prefix: an `ak_` key arrived where a `uk_` key belongs.
      expect(sent.every(entry => entry.keyClass === 'project')).toBe(true);
      expect(sent.every(entry => entry.status === 401)).toBe(true);
    },
    TEST_TIMEOUT_MS
  );
});
