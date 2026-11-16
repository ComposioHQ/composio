/**
 * Network faults: what the CLI does when a host it depends on misbehaves.
 *
 * Two invariants carry most of the weight. A read may be retried, and either
 * heals or fails with exit 1, empty stdout, and the cause on stderr. A tool
 * execution is sent exactly once whatever happens, because a second attempt
 * could act twice.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { CONSUMER_PROJECT, CONSUMER_USER_ID, type Fault } from '@e2e-tests/cli-fake-backend';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import {
  clean,
  EXECUTE_SLACK,
  ExecutionResult,
  RIG_TIMEOUT_MS,
  SEARCH_SLACK,
  SearchResult,
  stdoutJson,
  TEST_TIMEOUT_MS,
  writeDebugLog,
} from './support';

const SEARCH = 'toolRouter.session.search';

describe('network faults on a read (`search`)', () => {
  let rig: CliRig;

  beforeAll(async () => {
    rig = await startCliRig({ label: 'net-read' });
    await rig.login();
  }, RIG_TIMEOUT_MS);

  afterEach(() => rig.fake.faults.clear());

  afterAll(async () => {
    await writeDebugLog(rig, import.meta.dir, 'net-read');
    await rig.stop();
  });

  const searchRequests = (result: Awaited<ReturnType<CliRig['run']>>) =>
    result.requests.filter(entry => entry.route === SEARCH);

  it(
    'connection refused: fails with the cause and an empty stdout',
    async () => {
      // Port 9 (discard) has no listener on the host.
      const result = await rig.run(
        `COMPOSIO_BASE_URL=http://host.docker.internal:9 ${SEARCH_SLACK}`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(clean(result.stderr)).toContain('ECONNREFUSED');
      expect(result.requests).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  const persistent: ReadonlyArray<{
    name: string;
    fault: Fault;
    stderr: ReadonlyArray<string>;
    attempts: number;
  }> = [
    {
      name: 'HTTP 500 on every attempt',
      fault: { kind: 'status', status: 500 },
      stderr: ['Injected HTTP 500'],
      attempts: 3,
    },
    {
      name: 'HTTP 429 on every attempt',
      fault: { kind: 'status', status: 429, headers: { 'retry-after': '1' } },
      stderr: ['Injected HTTP 429'],
      attempts: 3,
    },
    {
      name: 'an HTML error page from a proxy',
      fault: { kind: 'html', status: 502 },
      stderr: ['502'],
      attempts: 3,
    },
    {
      name: 'connection reset before any response',
      fault: { kind: 'reset' },
      stderr: ['ECONNRESET'],
      attempts: 3,
    },
    {
      name: 'connection reset in the middle of the body',
      fault: { kind: 'reset-mid-body' },
      stderr: ['ECONNRESET'],
      attempts: 1,
    },
    {
      name: 'a body that is not JSON',
      fault: { kind: 'malformed-json' },
      stderr: ['is not in the shape this version of the CLI expects', 'composio upgrade'],
      attempts: 1,
    },
  ];

  for (const { name, fault, stderr, attempts } of persistent) {
    it(
      `${name}: exit 1, empty stdout, cause on stderr`,
      async () => {
        rig.fake.faults.inject({ route: SEARCH, fault });
        const result = await rig.run(SEARCH_SLACK);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        for (const text of stderr) expect(clean(result.stderr)).toContain(text);
        expect(searchRequests(result)).toHaveLength(attempts);
      },
      TEST_TIMEOUT_MS
    );
  }

  const transient: ReadonlyArray<{ name: string; fault: Fault }> = [
    { name: 'one HTTP 500', fault: { kind: 'status', status: 500 } },
    {
      name: 'one HTTP 429 with Retry-After',
      fault: { kind: 'status', status: 429, headers: { 'retry-after': '1' } },
    },
    { name: 'one connection reset', fault: { kind: 'reset' } },
  ];

  for (const { name, fault } of transient) {
    it(
      `${name}: the retry heals it and the caller sees a normal result`,
      async () => {
        rig.fake.faults.inject({ route: SEARCH, fault, times: 1 });
        const result = await rig.run(SEARCH_SLACK);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(stdoutJson(result, SearchResult).results[0]?.primary_tool_slugs).toEqual([
          'SLACK_SEND_MESSAGE',
        ]);
        expect(searchRequests(result).map(entry => entry.status)).toEqual([
          fault.kind === 'status' ? fault.status : 0,
          200,
        ]);
      },
      TEST_TIMEOUT_MS
    );
  }

  it(
    'a slow response: waits for it instead of giving up',
    async () => {
      rig.fake.faults.inject({ route: SEARCH, fault: { kind: 'delay', ms: 4000 } });
      const result = await rig.run(SEARCH_SLACK);
      expect(result.exitCode).toBe(0);
      expect(searchRequests(result)).toHaveLength(1);
      expect(stdoutJson(result, SearchResult).results).toHaveLength(1);
    },
    TEST_TIMEOUT_MS
  );

  for (const { name, fault } of [
    {
      name: 'valid JSON of an unexpected shape',
      fault: { kind: 'schema-drift', transform: () => ({ unexpected: true }) },
    },
    { name: 'an empty 200 body', fault: { kind: 'empty-body' } },
  ] satisfies ReadonlyArray<{ name: string; fault: Fault }>) {
    it(
      `${name}: reported as an unexpected response`,
      async () => {
        rig.fake.faults.inject({ route: SEARCH, fault });
        const result = await rig.run(SEARCH_SLACK);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(clean(result.stderr)).not.toContain('TypeError');
        expect(clean(result.stderr)).toContain('composio upgrade');
        expect(clean(result.stderr)).toContain(
          'is not in the shape this version of the CLI expects'
        );
      },
      TEST_TIMEOUT_MS
    );
  }
});

const EXECUTION_FAULTS: ReadonlyArray<{ name: string; fault: Fault }> = [
  { name: 'HTTP 500', fault: { kind: 'status', status: 500 } },
  { name: 'HTTP 429', fault: { kind: 'status', status: 429, headers: { 'retry-after': '1' } } },
  { name: 'an HTML error page', fault: { kind: 'html', status: 502 } },
  { name: 'a body that is not JSON', fault: { kind: 'malformed-json' } },
  { name: 'connection reset before any response', fault: { kind: 'reset' } },
  { name: 'connection reset in the middle of the body', fault: { kind: 'reset-mid-body' } },
];

for (const transport of [
  { name: 'Dashboard', dashboard: true, route: 'dashboard.execute' },
  { name: 'backend', dashboard: false, route: 'toolRouter.session.execute' },
] as const) {
  describe(`network faults on a tool execution (${transport.name} transport)`, () => {
    let rig: CliRig;

    beforeAll(async () => {
      rig = await startCliRig({
        label: `net-exec-${transport.name.toLowerCase()}`,
        dashboard: transport.dashboard,
      });
      await rig.login();
      rig.fake.world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
    }, RIG_TIMEOUT_MS);

    afterEach(() => rig.fake.faults.clear());

    afterAll(async () => {
      await writeDebugLog(rig, import.meta.dir, `net-exec-${transport.name.toLowerCase()}`);
      await rig.stop();
    });

    it(
      'without a fault the execution goes through this transport once',
      async () => {
        const result = await rig.run(EXECUTE_SLACK);
        expect(result.exitCode).toBe(0);
        expect(stdoutJson(result, ExecutionResult).successful).toBe(true);
        expect(result.requests.filter(entry => entry.route === transport.route)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS
    );

    for (const { name, fault } of EXECUTION_FAULTS) {
      it(
        `${name}: sent exactly once, reported as a failed result on stdout`,
        async () => {
          rig.fake.faults.inject({ route: transport.route, fault });
          const result = await rig.run(EXECUTE_SLACK);

          expect(result.exitCode).toBe(1);
          expect(result.requests.filter(entry => entry.route === transport.route)).toHaveLength(1);
          const outcome = stdoutJson(result, ExecutionResult);
          expect(outcome.successful).toBe(false);
          expect(outcome.error ?? '').not.toBe('');
          expect(outcome.data).toBeUndefined();
        },
        TEST_TIMEOUT_MS
      );
    }
  });
}
