/**
 * The loop agents live in, without a model: search, execute, link, execute
 * again, then the commands around it (`connections`, `--get-schema`,
 * `--dry-run`, `run`). Each step checks what the fake backend received, so a
 * step that printed success without acting fails here.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { CONSUMER_PROJECT, CONSUMER_USER_ID } from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import { z } from 'zod';
import {
  clean,
  commandRequests,
  EXECUTE_SLACK,
  ExecutionResult,
  RIG_TIMEOUT_MS,
  routesOf,
  SEARCH_SLACK,
  SearchResult,
  stdoutJson,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const Connections = z.record(
  z.string(),
  z.array(z.looseObject({ id: z.string(), status: z.string() }))
);

describe('tool loop: search, execute, link, execute', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'tool-loop' });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'tool-loop');
    await rig.stop();
  });

  it(
    '`search` finds the slug and names the next commands',
    async () => {
      const result = await rig.run(SEARCH_SLACK);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      const found = stdoutJson(result, SearchResult);
      expect(found.results[0]?.primary_tool_slugs).toEqual(['SLACK_SEND_MESSAGE']);
      // Not connected yet, so the first suggested step is the link.
      expect(found.next_steps.steps.map(step => step.command)[0]).toBe('composio link slack');

      const search = result.requests.find(entry => entry.route === 'toolRouter.session.search');
      expect(search).toMatchObject({ project: CONSUMER_PROJECT.label, userId: CONSUMER_USER_ID });
      expect(search?.body).toEqual({ queries: [{ use_case: 'send a slack message' }] });
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`execute` before linking fails with the command that fixes it',
    async () => {
      const result = await rig.run(EXECUTE_SLACK);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('');
      expect(stdoutJson(result, ExecutionResult)).toMatchObject({
        successful: false,
        error:
          'No active connection found for toolkit "slack". Run `composio link slack`, then retry.',
        slug: 'ToolRouterV2_NoActiveConnection',
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`connections list` shows nothing connected yet',
    async () => {
      const result = await rig.run('composio connections list');
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, Connections)).toEqual({});
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`link` creates the connection for the consumer user and waits until it is active',
    async () => {
      const result = await rig.run('composio link slack');
      expect(result.exitCode).toBe(0);
      expect(
        stdoutJson(result, z.looseObject({ status: z.string(), toolkit: z.string() }))
      ).toMatchObject({ status: 'success', toolkit: 'slack' });

      const link = result.requests.filter(entry => entry.route === 'toolRouter.session.link');
      expect(link).toHaveLength(1);
      expect(link[0]).toMatchObject({
        project: CONSUMER_PROJECT.label,
        userId: CONSUMER_USER_ID,
        body: { toolkit: 'slack' },
      });
      expect(routesOf(result)).toContain('connectedAccounts.retrieve');
      expect(
        rig.fake.world.activeConnection(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack')
      ).toBeDefined();
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`execute` after linking runs the tool with the given arguments',
    async () => {
      const result = await rig.run(EXECUTE_SLACK);
      expect(result.exitCode).toBe(0);
      expect(stdoutJson(result, ExecutionResult)).toMatchObject({
        successful: true,
        data: { ok: true, channel: 'general', message: { text: 'hello' } },
      });

      const execution = result.requests.filter(entry => entry.route === 'dashboard.execute');
      expect(execution).toHaveLength(1);
      expect(execution[0]?.body).toMatchObject({
        json: { tool_slug: 'SLACK_SEND_MESSAGE', arguments: { channel: 'general', text: 'hello' } },
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`connections list` shows the linked account as active',
    async () => {
      const result = await rig.run('composio connections list');
      expect(result.exitCode).toBe(0);
      const connections = stdoutJson(result, Connections);
      expect(Object.keys(connections)).toEqual(['slack']);
      expect(connections.slack?.map(account => account.status)).toEqual(['ACTIVE']);
    },
    TEST_TIMEOUT_MS
  );
});

describe('tool loop: looking before acting', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'tool-inspect' });
    await rig.login();
    rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'tool-inspect');
    await rig.stop();
  });

  const executions = (result: Awaited<ReturnType<CliRig['run']>>) =>
    result.requests.filter(entry => entry.route === 'dashboard.execute');

  it(
    '`--get-schema` prints the input schema and executes nothing',
    async () => {
      const result = await rig.run('composio execute SLACK_SEND_MESSAGE --get-schema');
      expect(result.exitCode).toBe(0);
      const schema = stdoutJson(
        result,
        z.looseObject({
          slug: z.string(),
          inputSchema: z.looseObject({ required: z.array(z.string()) }),
        })
      );
      expect(schema.slug).toBe('SLACK_SEND_MESSAGE');
      expect(schema.inputSchema.required).toEqual(['channel', 'text']);
      expect(executions(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    '`--dry-run` validates and reports the acting user without executing',
    async () => {
      const result = await rig.run(`${EXECUTE_SLACK} --dry-run`);
      expect(result.exitCode).toBe(0);
      expect(
        stdoutJson(result, z.looseObject({ dryRun: z.boolean(), userId: z.string() }))
      ).toMatchObject({ dryRun: true, userId: CONSUMER_USER_ID });
      expect(executions(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'arguments that miss a required field are rejected before the tool runs',
    async () => {
      const result = await rig.run(
        `composio execute SLACK_SEND_MESSAGE -d '{"channel":"general"}'`
      );
      expect(result.exitCode).toBe(1);
      const outcome = stdoutJson(result, ExecutionResult);
      expect(outcome.successful).toBe(false);
      expect(outcome.error).toContain('text');
      expect(executions(result)).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'an unknown tool slug fails with the backend message',
    async () => {
      const result = await rig.run(`composio execute SLACK_NO_SUCH_TOOL -d '{}'`);
      expect(result.exitCode).toBe(1);
      expect(stdoutJson(result, ExecutionResult)).toMatchObject({
        successful: false,
        error: 'Tool SLACK_NO_SUCH_TOOL not found',
      });
    },
    TEST_TIMEOUT_MS
  );
});

describe('tool loop: `run` with an inline script', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'run' });
    await rig.login();
    rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'run');
    await rig.stop();
  });

  it(
    'the injected `execute()` runs the tool on the consumer project and returns its result',
    async () => {
      const result = await rig.run(
        `composio run 'const sent = await execute("SLACK_SEND_MESSAGE", { channel: "general", text: "from run" }); console.log(JSON.stringify({ ok: sent.data.ok, text: sent.data.message.text }));'`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('{"ok":true,"text":"from run"}');

      const execution = result.requests.filter(entry => entry.route === 'dashboard.execute');
      expect(execution).toHaveLength(1);
      expect(execution[0]).toMatchObject({
        project: CONSUMER_PROJECT.label,
        userId: CONSUMER_USER_ID,
        keyClass: 'user',
      });
    },
    TEST_TIMEOUT_MS
  );

  it(
    'the injected `search()` returns what `composio search` prints',
    async () => {
      const result = await rig.run(
        `composio run 'const found = await search("send a slack message"); console.log(found.results[0].primary_tool_slugs.join(","));'`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('SLACK_SEND_MESSAGE');
      expect(routesOf(result)).toContain('toolRouter.session.search');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'an `execute()` that is not connected fails the script with the link command on stderr',
    async () => {
      const result = await rig.run(
        `composio run 'await execute("GITHUB_GET_THE_AUTHENTICATED_USER"); console.log("unreachable");'`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toContain('Run `composio link github`, then retry.');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a script that never calls a helper makes no tool request',
    async () => {
      const result = await rig.run(`composio run 'console.log(1 + 1)'`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('2');
      expect(commandRequests(result).filter(entry => entry.route?.includes('execute'))).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );
});
