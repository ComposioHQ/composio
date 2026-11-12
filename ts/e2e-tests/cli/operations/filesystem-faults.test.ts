/**
 * Filesystem faults: the state under `~/.composio` missing, corrupt,
 * read-only, or written by several invocations at once.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  MEMBER,
  USER_API_KEY,
} from '@e2e-tests/cli-fake-backend';
import { z } from 'zod';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import {
  clean,
  commandRequests,
  EXECUTE_SLACK,
  ExecutionResult,
  readStoredLogin,
  RIG_TIMEOUT_MS,
  SEARCH_SLACK,
  SearchResult,
  stdoutJson,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const Whoami = z.looseObject({ email: z.string() });

const NOT_LOGGED_IN = 'You are not logged in yet. Please run `composio login`.';
const STORED_LOGIN = '~/.composio/user_data.json';

describe('filesystem faults: the stored login', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'fs-login' });
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'fs-login');
    await rig.stop();
  });

  for (const { name, damage } of [
    { name: 'truncated JSON', damage: `printf '{"api_key":"uk_' > ${STORED_LOGIN}` },
    { name: 'JSON of the wrong type', damage: `echo '[]' > ${STORED_LOGIN}` },
    { name: 'an empty file', damage: `: > ${STORED_LOGIN}` },
    { name: 'a missing file', damage: `rm -f ${STORED_LOGIN}` },
  ]) {
    it(
      `${name}: commands report no login, and a new login repairs it`,
      async () => {
        await rig.login();
        await rig.run(damage);

        const result = await rig.run(SEARCH_SLACK);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(clean(result.stderr)).toBe(NOT_LOGGED_IN);
        expect(commandRequests(result)).toEqual([]);

        await rig.login();
        expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
        expect((await rig.run(SEARCH_SLACK)).exitCode).toBe(0);
      },
      TEST_TIMEOUT_MS
    );
  }
});

describe('filesystem faults: cache files', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'fs-cache' });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'fs-cache');
    await rig.stop();
  });

  it(
    'corrupt update-check, config, and permission caches do not fail a command',
    async () => {
      await rig.run(SEARCH_SLACK);
      await rig.run(
        `for f in update-check.json config.json tool-permissions-cache.json; do echo '{corrupt' > ~/.composio/$f; done`
      );
      const result = await rig.run(SEARCH_SLACK);
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, SearchResult).results).toHaveLength(1);
      // The tests below corrupt one file each; leave nothing else broken for them.
      await rig.run(
        'cd ~/.composio && rm -f update-check.json config.json tool-permissions-cache.json'
      );
    },
    TEST_TIMEOUT_MS
  );

  // CLI defect: a corrupt cached tool schema is fatal ("is not valid JSON") instead of being fetched again.
  it.failing(
    'a corrupt cached tool schema is fetched again',
    async () => {
      await rig.run(SEARCH_SLACK);
      await rig.run(`echo '{corrupt' > ~/.composio/tool_definitions/SLACK_SEND_MESSAGE.json`);
      const result = await rig.run(SEARCH_SLACK);
      expect(result.exitCode).toBe(0);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a corrupt cached tool schema is at least named, so it can be deleted',
    async () => {
      await rig.run(`mkdir -p ~/.composio/tool_definitions`);
      await rig.run(`echo '{corrupt' > ~/.composio/tool_definitions/SLACK_SEND_MESSAGE.json`);
      const result = await rig.run(SEARCH_SLACK);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toContain('is not valid JSON');
      expect(clean(result.stderr)).toContain(
        `${rig.journey.home}/.composio/tool_definitions/SLACK_SEND_MESSAGE.json`
      );
      await rig.run(`rm -f ~/.composio/tool_definitions/SLACK_SEND_MESSAGE.json`);
      expect((await rig.run(SEARCH_SLACK)).exitCode).toBe(0);
    },
    TEST_TIMEOUT_MS
  );
});

describe('filesystem faults: a read-only home', () => {
  let rig: CliRig;
  // Root ignores file modes, so these commands run as an ordinary user.
  const asUser = { user: '1000:1000' };

  beforeAll(async () => {
    rig = await startCliRig({ label: 'fs-readonly' });
    await rig.login();
    rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    await rig.run(SEARCH_SLACK);
    await rig.run('chown -R 1000:1000 ~ && chmod -R a-w ~/.composio');
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'fs-readonly');
    await rig.stop();
  });

  it(
    'reads keep working: `whoami` and `search` succeed with data on stdout',
    async () => {
      const whoami = await rig.run('composio whoami', asUser);
      expect(whoami.exitCode).toBe(0);
      expect(stdoutJson(whoami, Whoami).email).toBe(MEMBER.email);
      const search = await rig.run(SEARCH_SLACK, asUser);
      expect(search.exitCode).toBe(0);
      expect(stdoutJson(search, SearchResult).results).toHaveLength(1);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`execute` still runs the tool; the failed cache write stays off stdout',
    async () => {
      const result = await rig.run(EXECUTE_SLACK, asUser);
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, ExecutionResult).successful).toBe(true);
      expect(result.stdout).not.toMatch(/EACCES|EROFS|permission denied/i);
      expect(result.requests.filter(entry => entry.route === 'dashboard.execute')).toHaveLength(1);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`logout` fails, names the file it could not write, and leaves the login intact',
    async () => {
      const result = await rig.run('composio logout', asUser);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      const stderr = clean(result.stderr);
      expect(stderr).toContain('PermissionDenied');
      expect(stderr).toContain(`${rig.journey.home}/.composio/user_data.json`);
      expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
    },
    TEST_TIMEOUT_MS
  );
});

describe('filesystem faults: concurrent invocations', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'fs-concurrent' });
    await rig.login();
    rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'fs-concurrent');
    await rig.stop();
  });

  it(
    'eight searches on a cold cache all succeed and leave valid state',
    async () => {
      const result = await rig.run(
        [
          'rm -rf ~/.composio/tool_definitions',
          `for i in 1 2 3 4 5 6 7 8; do { ${SEARCH_SLACK} > /tmp/c$i.out 2> /tmp/c$i.err; echo $? > /tmp/c$i.rc; } & done`,
          'wait',
          'cat /tmp/c*.rc | tr -d "\\n"; echo',
          'cat /tmp/c*.err',
          'cat ~/.composio/tool_definitions/SLACK_SEND_MESSAGE.json > /dev/null',
        ].join('\n')
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('00000000');
      expect(result.stderr).toBe('');
      const cached: unknown = JSON.parse(
        await rig.journey.readFile(
          `${rig.journey.home}/.composio/tool_definitions/SLACK_SEND_MESSAGE.json`
        )
      );
      expect(cached).toBeObject();
      expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'four executions at once each reach the Dashboard exactly once',
    async () => {
      const result = await rig.run(
        [
          `for i in 1 2 3 4; do { ${EXECUTE_SLACK} > /tmp/e$i.out 2> /tmp/e$i.err; echo $? > /tmp/e$i.rc; } & done`,
          'wait',
          'cat /tmp/e*.rc | tr -d "\\n"; echo',
        ].join('\n')
      );
      expect(result.stdout.trim()).toBe('0000');
      expect(result.requests.filter(entry => entry.route === 'dashboard.execute')).toHaveLength(4);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a login racing other logins leaves one complete stored login',
    async () => {
      const result = await rig.run(
        [
          `for i in 1 2 3 4; do { composio login --user-api-key ${USER_API_KEY} --no-skill-install > /dev/null 2> /tmp/l$i.err; echo $? > /tmp/l$i.rc; } & done`,
          'wait',
          'cat /tmp/l*.rc | tr -d "\\n"; echo',
        ].join('\n')
      );
      expect(result.stdout.trim()).toBe('0000');
      expect((await readStoredLogin(rig)).api_key).toBe(USER_API_KEY);
      const leftovers = await rig.run('ls -a ~/.composio | grep -c "composio-tmp" || true');
      expect(leftovers.stdout.trim()).toBe('0');
    },
    TEST_TIMEOUT_MS
  );
});
