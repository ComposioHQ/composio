import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, it, vi } from 'vitest';
import {
  buildRunHelpersSource,
  extractInlineExecuteToolSlugs,
  inferCliInvocationPrefix,
  wrapInlineCodeForRun,
} from 'src/commands/run.cmd';
import {
  RUN_COMPANION_MODULE_FILENAMES,
  RUN_COMPANION_STATIC_ASSET_RELATIVE_PATHS,
  listMissingInstalledRunCompanionModules,
  readInstalledReleaseTag,
  resolveRunCompanionModulePath,
  writeInstalledReleaseTag,
} from 'src/services/run-companion-modules';
import {
  ACP_STRUCTURED_OUTPUT_WRAPPER_KEY,
  buildStructuredRepairPrompt,
  buildStructuredOutputToolSchema,
  buildStructuredPrompt,
  buildStructuredToolPrompt,
  finalizeInvokeAgentText,
} from 'src/services/run-subagent-shared';
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
          const stderrWrite = vi
            .spyOn(process.stderr, 'write')
            .mockImplementation((() => true) as never);
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
          expect(stderrWrite).toHaveBeenCalledWith(
            expect.stringMatching(/^RUN_LOG_FILE=.*run\.log\n$/)
          );
          expect(exit).toHaveBeenCalledWith(7);
        })
    );
  });

  layer(TestLive())(it => {
    it.scoped(
      '[Given] --acp-only [Then] run accepts the flag and forwards execution normally',
      () =>
        Effect.gen(function* () {
          const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
          const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
          vi.stubGlobal('Bun', { spawn });

          yield* cli(['run', '--acp-only', 'console.log("hi")']);

          expect(spawn).toHaveBeenCalledTimes(1);
          const spawnConfig = (spawn as any).mock.calls[0][0] as {
            cmd: string[];
          };
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(exit).toHaveBeenCalledWith(0);
        })
    );
  });

  layer(TestLive())(it => {
    it.scoped(
      '[Given] --logs-off [Then] run accepts the flag and forwards execution normally',
      () =>
        Effect.gen(function* () {
          const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
          const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
          vi.stubGlobal('Bun', { spawn });

          yield* cli(['run', '--logs-off', 'console.log("hi")']);

          expect(spawn).toHaveBeenCalledTimes(1);
          const spawnConfig = (spawn as any).mock.calls[0][0] as {
            cmd: string[];
          };
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(exit).toHaveBeenCalledWith(0);
        })
    );
  });

  layer(TestLive())(it => {
    it.scoped(
      '[Given] a multiline structured experimental_subAgent script [Then] run preserves the inline TypeScript source',
      () =>
        Effect.gen(function* () {
          const script = `
            const brief = await experimental_subAgent(
              [
                "Do not read files.",
                "Do not run terminal commands.",
                "Do not inspect the workspace.",
                "Return exactly this structured value:",
                "{\\"summary\\":\\"ok\\",\\"urgent\\":[\\"a\\",\\"b\\"]}",
              ].join("\\n"),
              {
                target: "codex",
                schema: z.object({ summary: z.string(), urgent: z.array(z.string()) }),
              }
            );
            console.log(JSON.stringify(brief));
            console.log(JSON.stringify(brief.structuredOutput));
          `;
          const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
          const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
          vi.stubGlobal('Bun', { spawn });

          yield* cli(['run', '--logs-off', script]);

          expect(spawn).toHaveBeenCalledTimes(1);
          const spawnConfig = (spawn as any).mock.calls[0][0] as {
            cmd: string[];
          };
          expect(spawnConfig.cmd[3]).toBe('--eval');
          expect(spawnConfig.cmd[4]).toContain('const brief = await experimental_subAgent(');
          expect(spawnConfig.cmd[4]).toContain('"Do not run terminal commands."');
          expect(spawnConfig.cmd[4]).toContain('].join("\\n"),');
          expect(spawnConfig.cmd[4]).toContain('target: "codex"');
          expect(spawnConfig.cmd[4]).toContain('console.log(JSON.stringify(brief));');
          expect(spawnConfig.cmd[4]).toContain(
            'return (console.log(JSON.stringify(brief.structuredOutput)));'
          );
          expect(spawnConfig.cmd[4]).not.toContain('"Do not run terminal\n');
          expect(exit).toHaveBeenCalledWith(0);
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
      '[Given] run help [Then] it documents injected execute, search, proxy, experimental_subAgent, and z helpers',
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
          expect(output).toContain('--skip-checks');
          expect(output).toContain('--logs-off');
          expect(output).toContain('experimental_subAgent');
          expect(output).toContain('schema: z.object');
          expect(output).toContain('INJECTED HELPERS');
          expect(output).toContain('Global from zod');
          expect(output).toContain('composio search "<query>"');
          expect(output).toContain('composio execute <slug> --get-schema');
          expect(output).not.toContain('--acp-only');
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
      acpOnly: true,
      logsOff: true,
      dryRun: true,
      runLogFilePath: '/tmp/composio-run/run.log',
    });

    expect(source).toContain('import { installRunHelpers } from "file://');
    expect(source).toContain('await installRunHelpers(');
    expect(source).toContain('"cliPrefix":["/tmp/composio"]');
    expect(source).toContain('"acpOnly":true');
    expect(source).toContain('"logsOff":true');
    expect(source).toContain('"runLogFilePath":"/tmp/composio-run/run.log"');
    expect(source).toContain('"consumerUserId":"consumer_user_test"');
    expect(source).not.toContain('globalThis.execute = async (slug, data = {}) => {');
  });
});

describe('run-subagent-shared', () => {
  it('[Given] a structured schema [Then] it appends a strict JSON response contract', () => {
    expect(buildStructuredPrompt('hello', { type: 'object' })).toContain(
      'Return only a valid JSON value that matches this schema.'
    );
  });

  it('[Given] a non-object structured schema [Then] the MCP output tool schema wraps it under a value key', () => {
    expect(buildStructuredOutputToolSchema({ type: 'array', items: { type: 'string' } })).toEqual({
      type: 'object',
      additionalProperties: false,
      required: [ACP_STRUCTURED_OUTPUT_WRAPPER_KEY],
      properties: {
        [ACP_STRUCTURED_OUTPUT_WRAPPER_KEY]: { type: 'array', items: { type: 'string' } },
      },
    });
  });

  it('[Given] structured tool mode [Then] the prompt instructs the agent to use the output tool', () => {
    expect(
      buildStructuredToolPrompt(
        'Summarize it.',
        { type: 'array', items: { type: 'string' } },
        'submit_structured_output'
      )
    ).toContain('call the MCP tool `submit_structured_output` exactly once');
  });

  it('[Given] a repair prompt [Then] it requires no more tools and JSON-only fallback', () => {
    const prompt = buildStructuredRepairPrompt(
      { type: 'object', properties: { summary: { type: 'string' } } },
      'submit_structured_output'
    );

    expect(prompt).toContain('Your previous response was not valid structured output.');
    expect(prompt).toContain('Do not read files. Do not run terminal commands.');
    expect(prompt).toContain('reply with only raw JSON matching the schema');
  });

  it('[Given] Zod-like structured output [Then] it validates and returns structured data', () => {
    const result = finalizeInvokeAgentText('{"ok":true}', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { ok: true },
    });
  });

  it('[Given] plain text output [Then] it omits structuredOutput', () => {
    const result = finalizeInvokeAgentText('hello', {});

    expect(result).toEqual({
      result: 'hello',
    });
    expect('structuredOutput' in result).toBe(false);
  });

  it('[Given] invalid JSON in structured mode [Then] it throws a clear error', () => {
    expect(() =>
      finalizeInvokeAgentText('not-json', {
        structuredSchema: { type: 'object' },
      })
    ).toThrow('experimental_subAgent() expected valid JSON output for structured response.');
  });

  it('[Given] prose followed by JSON in structured mode [Then] it recovers the final JSON payload', () => {
    const result = finalizeInvokeAgentText('Reading file now.\n{"ok":true}', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { ok: true },
    });
  });

  it('[Given] fenced JSON in structured mode [Then] it parses the fenced payload', () => {
    const result = finalizeInvokeAgentText('```json\n{"ok":true}\n```', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { ok: true },
    });
  });

  it('[Given] an object containing arrays [Then] it prefers the full object over an inner array', () => {
    const result = finalizeInvokeAgentText('Working...\n{"summary":"done","urgent":["a","b"]}', {
      structuredSchema: { type: 'object' },
      zodSchema: {
        safeParse: value => ({ success: true as const, data: value }),
      },
    });

    expect(result).toEqual({
      result: null,
      structuredOutput: { summary: 'done', urgent: ['a', 'b'] },
    });
  });
});

describe('inferCliInvocationPrefix', () => {
  it('[Given] a compiled bunfs entrypoint [Then] it falls back to the binary path only', () => {
    expect(inferCliInvocationPrefix(['node', '/$bunfs/root/composio'])).toEqual([process.execPath]);
  });
});

describe('resolveRunCompanionModulePath', () => {
  it('[Given] a bundled dist chunk [Then] it resolves sibling companion modules in dist', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-companion-dist-'));
    const callerPath = path.join(tempDir, 'commands-abc.mjs');
    const servicesDir = path.join(tempDir, 'services');
    const companionPath = path.join(servicesDir, 'run-subagent-shared.mjs');
    fs.writeFileSync(callerPath, '', 'utf8');
    fs.mkdirSync(servicesDir);
    fs.writeFileSync(companionPath, '', 'utf8');

    expect(
      resolveRunCompanionModulePath({
        callerImportMetaUrl: pathToFileURL(callerPath).href,
        execPath: '/tmp/composio',
        relativeNoExtensionFromCaller: '../services/run-subagent-shared',
      })
    ).toBe(companionPath);
  });

  it('[Given] a compiled bunfs caller [Then] it falls back to modules next to the binary', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-companion-bin-'));
    const execPath = path.join(tempDir, 'composio');
    const companionPath = path.join(tempDir, 'run-subagent-shared.mjs');
    fs.writeFileSync(companionPath, '', 'utf8');

    expect(
      resolveRunCompanionModulePath({
        callerImportMetaUrl: 'file:///$bunfs/root/commands.mjs',
        execPath,
        relativeNoExtensionFromCaller: '../services/run-subagent-shared',
      })
    ).toBe(companionPath);
  });
});

describe('run companion install metadata', () => {
  it('[Given] an installed release tag file [Then] run helpers can read it back from the install dir', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-release-tag-'));
    const execPath = path.join(tempDir, 'composio');

    writeInstalledReleaseTag(tempDir, '@composio/cli@0.2.12');

    expect(readInstalledReleaseTag(execPath)).toBe('@composio/cli@0.2.12');
  });

  it('[Given] a partial companion install [Then] it reports only the missing companion files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-'));
    const execPath = path.join(tempDir, 'composio');
    fs.writeFileSync(path.join(tempDir, RUN_COMPANION_MODULE_FILENAMES[0]!), '', 'utf8');

    expect(listMissingInstalledRunCompanionModules(execPath)).toEqual(
      [...RUN_COMPANION_MODULE_FILENAMES.slice(1), ...RUN_COMPANION_STATIC_ASSET_RELATIVE_PATHS]
        .slice()
        .sort()
    );
  });

  it('[Given] a nested companion dependency is missing [Then] it reports the missing helper asset', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-nested-'));
    const execPath = path.join(tempDir, 'composio');
    const servicesDir = path.join(tempDir, 'services');
    fs.mkdirSync(servicesDir, { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, 'run-helpers-runtime.mjs'),
      'export * from "./services/run-helpers-runtime.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-shared.mjs'),
      'export * from "./services/run-subagent-shared.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-acp.mjs'),
      'export * from "./services/run-subagent-acp.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-legacy.mjs'),
      'export * from "./services/run-subagent-legacy.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-output-mcp.mjs'),
      'export * from "./services/run-subagent-output-mcp.mjs";\n',
      'utf8'
    );

    fs.writeFileSync(
      path.join(servicesDir, 'run-helpers-runtime.mjs'),
      'export const runtimeValue = 1;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-shared.mjs'),
      'export const x = 1;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-acp.mjs'),
      'export * from "../run-companion-modules-abc123.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-legacy.mjs'),
      'export const y = 1;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-output-mcp.mjs'),
      'export const z = 1;\n',
      'utf8'
    );

    expect(listMissingInstalledRunCompanionModules(execPath)).toContain(
      'run-companion-modules-abc123.mjs'
    );
  });

  it('[Given] a named re-export dependency is missing [Then] it reports the missing helper asset', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-missing-reexport-'));
    const execPath = path.join(tempDir, 'composio');
    const servicesDir = path.join(tempDir, 'services');
    fs.mkdirSync(servicesDir, { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, 'run-helpers-runtime.mjs'),
      'export * from "./services/run-helpers-runtime.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-shared.mjs'),
      'export * from "./services/run-subagent-shared.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-acp.mjs'),
      'export * from "./services/run-subagent-acp.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-legacy.mjs'),
      'export * from "./services/run-subagent-legacy.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'run-subagent-output-mcp.mjs'),
      'export * from "./services/run-subagent-output-mcp.mjs";\n',
      'utf8'
    );

    fs.writeFileSync(
      path.join(servicesDir, 'run-helpers-runtime.mjs'),
      'export const runtimeValue = 1;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-shared.mjs'),
      'export const sharedValue = 1;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-acp.mjs'),
      'export { helperValue } from "../run-companion-modules-def456.mjs";\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-legacy.mjs'),
      'export const legacyValue = 1;\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(servicesDir, 'run-subagent-output-mcp.mjs'),
      'export const outputValue = 1;\n',
      'utf8'
    );

    expect(listMissingInstalledRunCompanionModules(execPath)).toContain(
      'run-companion-modules-def456.mjs'
    );
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
