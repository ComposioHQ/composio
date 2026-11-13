/**
 * Identity: which project and which user a command acts on.
 *
 * The root tree acts on the consumer project as the consumer user; the dev
 * tree acts on a developer project as a test user. Each claim below is checked
 * against what the fake backend received, not against what the CLI printed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  GLOBAL_TEST_USER_ID,
  OTHER_DEVELOPER_PROJECT,
  ORG,
} from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import {
  clean,
  commandRequests,
  DEV_DIRECTORY,
  EXECUTE_SLACK,
  ExecutionResult,
  initDeveloperDirectory,
  PLAYGROUND_EXECUTE_SLACK,
  RIG_TIMEOUT_MS,
  routesOf,
  SLACK_ARGUMENTS,
  stdoutJson,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const inDevDirectory = (command: string) => `cd ${DEV_DIRECTORY} && ${command}`;

/** A row of the help printed with the error: the name indented, then its description or type. */
const helpRow = (name: string) =>
  new RegExp(`^\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm');

describe('identity: the two command trees', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'identity' });
    await rig.login();
    await initDeveloperDirectory(rig);
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'identity');
    await rig.stop();
  });

  describe('the same tool on each tree', () => {
    it(
      'root `execute` acts on the consumer project as the consumer user',
      async () => {
        rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
        const result = await rig.run(inDevDirectory(EXECUTE_SLACK));

        expect(result.exitCode).toBe(0);
        expect(stdoutJson(result, ExecutionResult).successful).toBe(true);

        const execution = result.requests.filter(entry => entry.route === 'dashboard.execute');
        expect(execution).toHaveLength(1);
        expect(execution[0]).toMatchObject({
          role: 'dashboard',
          keyClass: 'user',
          orgId: ORG.id,
          project: CONSUMER_PROJECT.label,
          userId: CONSUMER_USER_ID,
        });
        // Run from an initialized developer directory on purpose: the
        // directory's project must not leak into a root-tree command.
        const projects = commandRequests(result).map(entry => entry.project);
        expect(projects).not.toContain(DEVELOPER_PROJECT.label);
        expect(routesOf(result)).not.toContain('toolRouter.session.execute');
      },
      TEST_TIMEOUT_MS
    );

    it(
      'dev `playground-execute` acts on the developer project as the global test user',
      async () => {
        rig.fake.world.connect(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack');
        const result = await rig.run(inDevDirectory(PLAYGROUND_EXECUTE_SLACK));

        expect(result.exitCode).toBe(0);
        expect(stdoutJson(result, ExecutionResult).successful).toBe(true);

        const execution = result.requests.filter(
          entry => entry.route === 'toolRouter.session.execute'
        );
        expect(execution).toHaveLength(1);
        expect(execution[0]).toMatchObject({
          role: 'backend',
          keyClass: 'user',
          project: DEVELOPER_PROJECT.label,
          userId: GLOBAL_TEST_USER_ID,
        });
        expect(routesOf(result)).not.toContain('dashboard.execute');
        expect(commandRequests(result).map(entry => entry.project)).not.toContain(
          CONSUMER_PROJECT.label
        );
      },
      TEST_TIMEOUT_MS
    );

    it(
      'dev `--user-id` replaces the test user',
      async () => {
        rig.fake.world.connect(DEVELOPER_PROJECT.label, 'alice', 'slack');
        const result = await rig.run(inDevDirectory(`${PLAYGROUND_EXECUTE_SLACK} --user-id alice`));

        expect(result.exitCode).toBe(0);
        const execution = result.requests.find(
          entry => entry.route === 'toolRouter.session.execute'
        );
        expect(execution).toMatchObject({ project: DEVELOPER_PROJECT.label, userId: 'alice' });
      },
      TEST_TIMEOUT_MS
    );

    it(
      'dev `--project-name` targets the named developer project',
      async () => {
        rig.fake.world.connect(OTHER_DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack');
        const result = await rig.run(
          inDevDirectory(
            `${PLAYGROUND_EXECUTE_SLACK} --project-name ${OTHER_DEVELOPER_PROJECT.name}`
          )
        );

        expect(result.exitCode).toBe(0);
        const execution = result.requests.find(
          entry => entry.route === 'toolRouter.session.execute'
        );
        expect(execution).toMatchObject({
          project: OTHER_DEVELOPER_PROJECT.label,
          userId: GLOBAL_TEST_USER_ID,
        });
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('connections do not cross trees', () => {
    it(
      'an account linked on the root tree is not connected on the dev tree',
      async () => {
        const link = await rig.run(inDevDirectory('composio link github'));
        expect(link.exitCode).toBe(0);
        expect(
          link.requests.find(entry => entry.route === 'toolRouter.session.link')
        ).toMatchObject({ project: CONSUMER_PROJECT.label, userId: CONSUMER_USER_ID });

        const execution = await rig.run(
          inDevDirectory(
            `composio dev playground-execute GITHUB_GET_THE_AUTHENTICATED_USER -d '{}'`
          )
        );
        expect(execution.exitCode).toBe(1);
        expect(stdoutJson(execution, ExecutionResult)).toMatchObject({
          successful: false,
          slug: 'ToolRouterV2_NoActiveConnection',
        });
      },
      TEST_TIMEOUT_MS
    );

    it(
      'an account linked on the dev tree is not connected on the root tree',
      async () => {
        const link = await rig.run(inDevDirectory('composio dev connected-accounts link gmail'));
        expect(link.exitCode).toBe(0);
        expect(
          link.requests.find(entry => entry.route === 'toolRouter.session.link')
        ).toMatchObject({ project: DEVELOPER_PROJECT.label, userId: GLOBAL_TEST_USER_ID });

        const execution = await rig.run(
          `composio execute GMAIL_SEND_EMAIL -d '{"recipient_email":"a@b.test"}'`
        );
        expect(execution.exitCode).toBe(1);
        expect(stdoutJson(execution, ExecutionResult)).toMatchObject({
          successful: false,
          slug: 'ToolRouterV2_NoActiveConnection',
        });
      },
      TEST_TIMEOUT_MS
    );

    it(
      'root `execute` without a connection names the root command that fixes it',
      async () => {
        const result = await rig.run(
          `composio execute GMAIL_SEND_EMAIL -d '{"recipient_email":"a@b.test"}'`
        );
        expect(result.exitCode).toBe(1);
        expect(stdoutJson(result, ExecutionResult).error).toContain('composio link gmail');
      },
      TEST_TIMEOUT_MS
    );

    it(
      'dev `playground-execute` without a connection names a dev-tree command that fixes it',
      async () => {
        const result = await rig.run(
          inDevDirectory(
            `composio dev playground-execute GITHUB_GET_THE_AUTHENTICATED_USER -d '{}'`
          )
        );
        const { error } = stdoutJson(result, ExecutionResult);
        expect(error).toContain('composio dev connected-accounts link github');
        expect(error).not.toContain('composio link github');
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('the developer project of the directory', () => {
    const OTHER_DIRECTORY = '/work/other-app';
    const listInOtherDirectory = async () => {
      await rig.journey.writeFile(
        `${OTHER_DIRECTORY}/.composio/project.json`,
        JSON.stringify({
          org_id: ORG.id,
          project_id: OTHER_DEVELOPER_PROJECT.nanoId,
          project_name: OTHER_DEVELOPER_PROJECT.name,
        })
      );
      const result = await rig.run(`cd ${OTHER_DIRECTORY} && composio dev auth-configs list`);
      return { result, listing: result.requests.find(entry => entry.route === 'authConfigs.list') };
    };

    it(
      "today: `dev auth-configs list` in another project's directory sends no scope and gets the key's default project",
      async () => {
        const { result, listing } = await listInOtherDirectory();
        expect(result.exitCode).toBe(0);
        expect(listing).toMatchObject({
          project: DEVELOPER_PROJECT.label,
          projectFrom: 'key-default',
        });
      },
      TEST_TIMEOUT_MS
    );

    // CLI defect: commands on the shared backend client send the user key with no org or project scope, so the backend picks the project.
    it.failing(
      '`dev auth-configs list` is scoped to the project the directory is set up for',
      async () => {
        const { listing } = await listInOtherDirectory();
        expect(listing?.projectFrom).toBe('scope-headers');
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('a command from the wrong tree', () => {
    const cases = [
      {
        command: `composio dev execute SLACK_SEND_MESSAGE -d ${SLACK_ARGUMENTS}`,
        message: 'Unknown subcommand "execute" for "composio dev"',
        listed: 'playground-execute',
      },
      {
        command: 'composio dev link slack',
        message: 'Unknown subcommand "link" for "composio dev"',
        listed: 'connected-accounts',
      },
      {
        command: `composio playground-execute SLACK_SEND_MESSAGE -d ${SLACK_ARGUMENTS}`,
        message: 'Unknown subcommand "playground-execute" for "composio"',
        listed: 'execute',
      },
      {
        command: 'composio auth-configs list',
        message: 'Unknown subcommand "auth-configs" for "composio"',
        listed: 'dev',
      },
      {
        command: `${EXECUTE_SLACK} --user-id alice`,
        message: 'Unrecognized flag: --user-id in command composio execute',
        listed: '--account',
      },
    ] as const;

    for (const { command, message, listed } of cases) {
      it(
        `\`${command.split(' -d ')[0]}\` fails before any request, naming what was wrong`,
        async () => {
          const result = await rig.run(command);
          expect(result.exitCode).toBe(1);
          expect(result.stdout).toBe('');
          const stderr = clean(result.stderr);
          expect(stderr).toContain(message);
          // The help printed with the error is what lets an agent find the real command.
          expect(stderr).toMatch(helpRow(listed));
          expect(commandRequests(result)).toEqual([]);
        },
        TEST_TIMEOUT_MS
      );
    }

    // The two tests below pin what the CLI does today, not what it should do.
    // Nothing in the repo says what a wrong-tree command should answer, so they
    // are listed as known gaps in the README instead of as expected failures.
    it(
      'today: `composio dev link --help` prints the `dev` help and exits 0, as if the command existed',
      async () => {
        const result = await rig.run('composio dev link --help');
        expect(result.exitCode).toBe(0);
        expect(`${result.stdout}${clean(result.stderr)}`).toContain('connected-accounts');
      },
      TEST_TIMEOUT_MS
    );

    it(
      'today: `composio dev link` lists `connected-accounts` but never names `connected-accounts link`',
      async () => {
        const result = await rig.run('composio dev link slack');
        expect(clean(result.stderr)).not.toContain('composio dev connected-accounts link');
      },
      TEST_TIMEOUT_MS
    );
  });

  describe('a help page teaches its own tree', () => {
    // One `link` definition serves both trees, so its examples must follow the page they are on.
    const examplesOf = (help: string) =>
      (help.split('EXAMPLES')[1] ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('composio '));

    for (const page of ['composio link', 'composio dev connected-accounts link']) {
      it(
        `\`${page} --help\` shows examples of \`${page}\` only`,
        async () => {
          const result = await rig.run(`${page} --help`);
          expect(result.exitCode).toBe(0);
          const examples = examplesOf(clean(`${result.stdout}${result.stderr}`));
          expect(examples.length).toBeGreaterThan(0);
          expect(examples.filter(example => !example.startsWith(`${page} `))).toEqual([]);
          expect(commandRequests(result)).toEqual([]);
        },
        TEST_TIMEOUT_MS
      );
    }
  });

  // Last, so it covers every command above: links, auth configs, both executions.
  it(
    'never sends the project API key `dev init` minted',
    async () => {
      expect(rig.fake.world.mintedProjectKeys).toHaveLength(1);
      const classes = new Set(
        rig.fake.journal
          .entries()
          .filter(entry => entry.role === 'backend' || entry.role === 'dashboard')
          .map(entry => entry.keyClass)
      );
      expect([...classes]).toEqual(['user']);
    },
    TEST_TIMEOUT_MS
  );
});

describe('identity: a missing acting user', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'acting-user' });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'acting-user');
    await rig.stop();
  });

  it(
    'root tree: an empty consumer user id fails with the consumer message',
    async () => {
      const disarm = rig.fake.faults.inject({
        route: '_internal.org.consumer.project.resolve',
        fault: {
          kind: 'schema-drift',
          transform: body => ({ ...(body as Record<string, unknown>), consumer_user_id: '' }),
        },
      });
      const result = await rig.run(EXECUTE_SLACK);
      disarm();

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toBe(
        'Missing consumer user id. Run `composio login` and try again.'
      );
      expect(routesOf(result)).not.toContain('dashboard.execute');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'dev tree: no developer project for the directory fails with the dev message',
    async () => {
      const result = await rig.run(PLAYGROUND_EXECUTE_SLACK);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toBe(
        'No developer project configured for this directory. Run `composio dev init`.'
      );
      expect(commandRequests(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'dev tree: `--project-name` without any test user fails with the dev message',
    async () => {
      await rig.run(
        `sed -i 's/"test_user_id":"[^"]*"/"test_user_id":null/' ~/.composio/user_data.json`
      );
      const result = await rig.run(
        `${PLAYGROUND_EXECUTE_SLACK} --project-name ${DEVELOPER_PROJECT.name}`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toBe(
        'Missing user id. Provide --user-id, or run `composio login` to store a global test user id.'
      );
      expect(routesOf(result)).not.toContain('toolRouter.session.execute');
    },
    TEST_TIMEOUT_MS
  );
});
