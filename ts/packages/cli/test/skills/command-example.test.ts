import { vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { ComposioClientSingleton, type ClientScope } from 'src/services/composio-clients';
import { describe, expect, it } from '@effect/vitest';
import { cliExit, MockConsole, recordedInvocationCalls, pkg, TestLive } from 'test/__utils__';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';

// The example enters the real root tree, registration and runInvocation. No production command changes.
vi.mock(
  'src/commands/connections/list/connections.list.cmd',
  () => import('./command-example.cmd')
);

const invoke = (args: ReadonlyArray<string>, loggedIn = true) =>
  Effect.gen(function* () {
    const stub = stubClientResources(['connectedAccounts'], () =>
      Response.json({ items: [], next_cursor: null })
    );
    const scopes: ClientScope[] = [];
    const recordingFactory = Layer.effect(
      ComposioClientSingleton,
      Effect.gen(function* () {
        const base = yield* ComposioClientSingleton;
        return ComposioClientSingleton.of({
          ...base,
          getFor: params =>
            Effect.suspend(() => {
              scopes.push(params);
              return base.getFor(params);
            }),
        });
      })
    );
    const { exitCode } = yield* cliExit(args).pipe(
      Effect.provide(recordingFactory),
      Effect.provide(stub.layer)
    );
    const stdout = yield* MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
    const stderr = yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
    const calls = yield* recordedInvocationCalls;
    const lifecycle = calls.flatMap(call =>
      call.service === 'CommandLifecycleTelemetry' && call.event !== 'pluginHintShown'
        ? [{ event: call.event, path: call.context.commandPath }]
        : []
    );
    return { exitCode, stdout, stderr, calls, lifecycle, requests: stub.requests, scopes };
  }).pipe(Effect.provide(TestLive(loggedIn ? { fixture: 'user-config-with-global-context' } : {})));

describe('CLI skill command example', () => {
  it.effect('maps an optional flag to a native Effect client request and prints only data', () =>
    Effect.gen(function* () {
      const result = yield* invoke(['connections', 'list', '--toolkit', 'github']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toEqual(['[]']);
      expect(result.stderr).toEqual([]);
      expect(result.requests).toHaveLength(1);
      expect(result.scopes.at(-1)).toEqual({ orgId: 'org_1', projectId: 'consumer_project_test' });
      const request = result.requests[0]!;
      expect(request.method).toBe('GET');
      const url = new URL(request.path, 'https://stub.invalid');
      expect(url.pathname).toBe('/api/v3.1/connected_accounts');
      expect(url.searchParams.get('toolkit_slugs')).toBe('github');
      expect(url.searchParams.get('user_ids')).toBe('consumer-user-org_1');
      expect(result.lifecycle).toEqual([
        { event: 'invoked', path: 'connections list' },
        { event: 'succeeded', path: 'connections list' },
      ]);
    })
  );

  it.effect('omits the filter when absent', () =>
    Effect.gen(function* () {
      const result = yield* invoke(['connections', 'list']);
      expect(result.exitCode).toBe(0);
      expect(result.requests).toHaveLength(1);
      const url = new URL(result.requests[0]!.path, 'https://stub.invalid');
      expect(url.searchParams.has('toolkit_slugs')).toBe(false);
    })
  );

  it.effect('enforces inherited login metadata before sending requests', () =>
    Effect.gen(function* () {
      const result = yield* invoke(['connections', 'list'], false);
      expect(result.exitCode).toBe(1);
      expect(result.requests).toEqual([]);
      expect(result.stdout).toEqual([]);
      expect(result.stderr.join('\n')).toContain('composio login');
      expect(result.lifecycle.at(-1)).toEqual({ event: 'failed', path: 'connections list' });
    })
  );

  it.effect.each([
    { args: ['connections', 'list', '--help'], code: 0, text: '--toolkit' },
    { args: ['connections', 'list', '--version'], code: 0, text: pkg.version },
    { args: ['connections', 'list', '--unknown'], code: 1, text: '--unknown' },
  ])('handles $args without reaching the handler', ({ args, code, text }) =>
    Effect.gen(function* () {
      const result = yield* invoke(args, false);
      expect(result.exitCode).toBe(code);
      expect(result.requests).toEqual([]);
      expect([...result.stdout, ...result.stderr].join('\n')).toContain(text);
      expect(result.calls.filter(call => call.service !== 'CommandLifecycleTelemetry')).toEqual([]);
    })
  );
});
