import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, it, vi } from 'vitest';
import {
  buildRunHelpersSource,
  extractInlineExecuteToolSlugs,
  inferCliInvocationPrefix,
  wrapInlineCodeForRun,
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
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(spawnConfig.cmd[4]).toContain('(async () => {');
          expect(spawnConfig.cmd[4]).toContain('return (console.log("hi"));');
          expect(spawnConfig.cmd[4]).toContain('if (__composioResult !== undefined) {');
          expect(spawnConfig.cmd.slice(5)).toEqual(['--', '--flag', 'value']);
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
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-test-'));
        const scriptPath = path.join(tempDir, 'script.ts');
        fs.writeFileSync(scriptPath, 'const value = 1 + 1;\nvalue * 2;\n', 'utf8');
        const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        vi.stubGlobal('Bun', { spawn });

        try {
          yield* cli(['run', '--file', scriptPath, '--', 'hello']);

          expect(spawn).toHaveBeenCalledTimes(1);
          const spawnConfig = (spawn as any).mock.calls[0][0] as {
            cmd: string[];
            env: unknown;
            stdio: string[];
          };
          expect(spawnConfig.cmd[0]).toBe(process.execPath);
          expect(spawnConfig.cmd[1]).toBe('--preload');
          expect(spawnConfig.cmd[2]).toMatch(/globals\.mjs$/);
          expect(spawnConfig.cmd[3]).toMatch(/\.composio-run-.*\.ts$/);
          expect(spawnConfig.cmd[4]).toBe('--');
          expect(spawnConfig.cmd[5]).toBe('hello');
          expect(spawnConfig.env).toEqual(
            expect.objectContaining({
              ...process.env,
              BUN_BE_BUN: '1',
            })
          );
          expect(spawnConfig.stdio).toEqual(['inherit', 'inherit', 'inherit']);
          expect(exit).toHaveBeenCalledWith(0);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
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
      '[Given] run help [Then] it documents injected execute, search, proxy, subAgent, and z helpers',
      () =>
        Effect.gen(function* () {
          yield* cli(['run', '--help']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain(
            'Run inline TS/JS code or a file with injected Composio helpers that behave like their CLI counterparts.'
          );
          expect(output).toContain('--skip-connection-check');
          expect(output).toContain('--skip-tool-params-check');
          expect(output).toContain('--no-verify');
          expect(output).toContain('subAgent');
          expect(output).toContain('schema: z.object');
          expect(output).toContain('INJECTED HELPERS');
          expect(output).toContain('Global from zod');
          expect(output).toContain('composio search "<query>"');
          expect(output).toContain('composio execute <slug> --get-schema');
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

    expect(source).toContain('import { z } from "zod";');
    expect(source).toContain('globalThis.z = z;');
    expect(source).toContain('globalThis.zod = z;');
    expect(source).toContain('const stringifyForPrompt = (value) => {');
    expect(source).toContain('const attachPromptMethod = (value) => {');
    expect(source).toContain('typeof value.prompt === "function"');
    expect(source).toContain(
      'value: () => stringifyForPrompt("data" in value ? value.data : value),'
    );
    expect(source).toContain(
      'const sharedRunOutputDir = typeof helperContext.runOutputDir === "string"'
    );
    expect(source).toContain('COMPOSIO_RUN_OUTPUT_DIR');
    expect(source).toContain('fs.mkdtempSync(path.join(sharedRunOutputDir, "invoke-agent-"))');
    expect(source).toContain('const maybeLoadStoredCliResult = (result) => {');
    expect(source).toContain('storedInFilePath: outputFilePath !== null,');
    expect(source).toContain('outputFilePath,');
    expect(source).toContain('const logCliResultPreview = (requestId, result) => {');
    expect(source).toContain('helperDebugLog("cli.result", {');
    expect(source).toContain('helperDebugLog("cli.result.stored_in_file"');
    expect(source).toContain('COMPOSIO_USER_API_KEY');
    expect(source).toContain('"consumerUserId":"consumer_user_test"');
    expect(source).toContain('__composioConsumerContext');
    expect(source).toContain('globalThis.execute = async (slug, data = {}) => {');
    expect(source).toContain(
      'if (result && typeof result === "object" && result.successful === false) {'
    );
    expect(source).toContain('Object.assign(error, { result, slug });');
    expect(source).toContain('globalThis.subAgent = subAgentImpl;');
    expect(source).toContain(
      'Object.defineProperty(globalThis.subAgent, "schema", { value: subAgentSchema });'
    );
    expect(source).toContain('globalThis.invokeAgent = subAgentImpl;');
    expect(source).toContain('const toInvokeAgentResponse = (master, target, payload = {}) => ({');
    expect(source).toContain('const invokeClaudeAgent = async (prompt, options) => {');
    expect(source).toContain('const invokeCodexAgent = async (prompt, options) => {');
    expect(source).toContain('const detectInvokeAgentMaster = () => {');
    expect(source).toContain(
      'throw new Error("subAgent() accepts either options.schema or options.jsonSchema, not both.");'
    );
    expect(source).toContain('const inputSchema = options.schema ?? options.jsonSchema;');
    expect(source).toContain('if (typeof z.toJSONSchema !== "function") {');
    expect(source).toContain(
      'subAgent() requires Zod 4 with z.toJSONSchema() when using options.schema.'
    );
    expect(source).toContain('structuredSchema = z.toJSONSchema(inputSchema);');
    expect(source).toContain(
      '["codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-o", outputPath]'
    );
    expect(source).toContain('["claude", "--bare", "-p", "--output-format", "json"]');
    expect(source).toContain('structuredOutput: parsed.structured_output ?? null');
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

describe('wrapInlineCodeForRun', () => {
  it('[Given] inline code ending in an expression [Then] it rewrites the last expression to a return', () => {
    expect(
      wrapInlineCodeForRun(`
        const value = 1 + 1;
        value * 2;
      `)
    ).toContain('return (value * 2);');
  });
});
