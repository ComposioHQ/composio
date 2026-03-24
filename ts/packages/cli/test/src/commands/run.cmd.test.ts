import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, it, vi } from 'vitest';
import {
  buildRunHelpersSource,
  extractInlineExecuteToolSlugs,
  inferCliInvocationPrefix,
} from 'src/commands/run.cmd';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio run', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  layer(TestLive())(it => {
    it.scoped(
      '[Given] inline code and args [Then] it forwards them to the embedded Bun runtime',
      () =>
        Effect.gen(function* () {
          const spawn = vi.fn(() => ({ exited: Promise.resolve(7) }));
          const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
          vi.stubGlobal('Bun', { spawn });

          yield* cli(['run', 'console.log("hi")', '--flag', 'value']);

          expect(spawn).toHaveBeenCalledTimes(1);
          const spawnConfig = (spawn as any).mock.calls[0][0] as {
            cmd: string[];
            env: unknown;
            stdio: string[];
          };
          expect(spawnConfig.cmd[0]).toBe(process.execPath);
          expect(spawnConfig.cmd[1]).toBe('--preload');
          expect(spawnConfig.cmd[2]).toMatch(/globals\.mjs$/);
          expect(spawnConfig.cmd.slice(3)).toEqual([
            '--eval',
            'console.log("hi")',
            '--',
            '--flag',
            'value',
          ]);
          expect(spawnConfig.env).toEqual(
            expect.objectContaining({
              ...process.env,
              BUN_BE_BUN: '1',
            })
          );
          expect(spawnConfig.stdio).toEqual(['inherit', 'inherit', 'inherit']);
          expect(exit).toHaveBeenCalledWith(7);
        })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] --file [Then] it forwards file execution to the embedded Bun runtime', () =>
      Effect.gen(function* () {
        const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        vi.stubGlobal('Bun', { spawn });

        yield* cli(['run', '--file', './script.ts', '--', 'hello']);

        expect(spawn).toHaveBeenCalledTimes(1);
        const spawnConfig = (spawn as any).mock.calls[0][0] as {
          cmd: string[];
          env: unknown;
          stdio: string[];
        };
        expect(spawnConfig.cmd[0]).toBe(process.execPath);
        expect(spawnConfig.cmd[1]).toBe('--preload');
        expect(spawnConfig.cmd[2]).toMatch(/globals\.mjs$/);
        expect(spawnConfig.cmd.slice(3)).toEqual(['run', './script.ts', '--', 'hello']);
        expect(spawnConfig.env).toEqual(
          expect.objectContaining({
            ...process.env,
            BUN_BE_BUN: '1',
          })
        );
        expect(spawnConfig.stdio).toEqual(['inherit', 'inherit', 'inherit']);
        expect(exit).toHaveBeenCalledWith(0);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] no inline code and no --file [Then] it fails with a clear error', () =>
      Effect.gen(function* () {
        const exit = yield* cli(['run']).pipe(Effect.exit);
        expect(exit._tag).toBe('Failure');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped(
      '[Given] run help [Then] it documents injected execute, search, and proxy helpers',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', '--help']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('await search(query');
          expect(output).toContain('await execute(slug, data?)');
          expect(output).toContain('const fetch = await proxy(toolkit)');
          expect(output).toContain('proxy.schema');
          expect(output).toContain('import { $ } from "bun"');
          expect(output).toContain(
            'All three helpers automatically reuse your top level auth state'
          );
          expect(output).toContain('tool_definitions');
        })
    );
  });
});

describe('buildRunHelpersSource', () => {
  it('[Given] consumer context [Then] it embeds auth and consumer metadata in the helper source', () => {
    const source = buildRunHelpersSource(['/tmp/composio'], {
      apiKey: 'test_api_key',
      baseURL: 'https://api.example.test',
      webURL: 'https://app.example.test',
      orgId: 'org_test',
      consumerUserId: 'consumer_user_test',
      dryRun: true,
    });

    expect(source).toContain('COMPOSIO_USER_API_KEY');
    expect(source).toContain('"consumerUserId":"consumer_user_test"');
    expect(source).toContain('__composioConsumerContext');
    expect(source).toContain('globalThis.proxy = async (toolkit) => {');
    expect(source).toContain('const proxyFetch = async (input, init = {}) => {');
    expect(source).toContain('return toProxyResponse(result);');
    expect(source).toContain(
      'Object.defineProperty(globalThis.proxy, "schema", { value: proxySchema });'
    );
    expect(source).toContain('`/api/v3/tool_router/session/${sessionId}/proxy_execute`');
    expect(source).toContain('"proxy() requires a consumer project context');
    expect(source).toContain('returned no JSON output');
    expect(source).toContain('args.push("--dry-run");');
    expect(source).toContain('args.push("--skip-connection-check");');
    expect(source).toContain('args.push("--skip-tool-params-check");');
    expect(source).toContain('args.push("--no-verify");');
    expect(source).toContain(
      "stdio: ['inherit', 'pipe', perfDebugEnabled || toolDebugEnabled ? 'inherit' : 'pipe']"
    );
  });
});

describe('inferCliInvocationPrefix', () => {
  it('[Given] a compiled bunfs entrypoint [Then] it falls back to the binary path only', () => {
    expect(inferCliInvocationPrefix(['node', '/$bunfs/root/composio'])).toEqual([process.execPath]);
  });
});

describe('extractInlineExecuteToolSlugs', () => {
  it('[Given] inline run source [Then] it finds static execute slugs from the AST', () => {
    expect(
      extractInlineExecuteToolSlugs(`
        const first = await execute("GMAIL_SEND_EMAIL", { to: "a@b.com" });
        const dynamic = await execute(slug, payload);
        execute('GITHUB_CREATE_ISSUE', { owner: 'acme' });
        execute("GMAIL_SEND_EMAIL", { to: "b@c.com" });
      `)
    ).toEqual(['GMAIL_SEND_EMAIL', 'GITHUB_CREATE_ISSUE']);
  });
});
