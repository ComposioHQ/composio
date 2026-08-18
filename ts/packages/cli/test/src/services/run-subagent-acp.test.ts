import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { BunContext } from '@effect/platform-bun';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from '@effect/vitest';
import {
  BufferedChunkLogger,
  createStructuredOutputMcpContext,
  MissingAcpAdapterAssetsError,
  readableStreamFromNode,
  resolveAcpAdapterCommand,
  selectPermissionOutcome,
} from 'src/services/run-subagent-acp';
import { RUN_COMPANION_MODULE_FILENAMES } from 'src/services/run-companion-modules';
import { AcpInvokeError, isAcpInvokeError } from 'src/services/run-subagent-shared';

describe('run-subagent-acp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pauses a Node producer while the Web Stream queue is full', async () => {
    const input = new Readable({ read: () => undefined });
    const stream = readableStreamFromNode(input);

    input.push(new TextEncoder().encode('first'));
    input.push(new TextEncoder().encode('second'));
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(input.isPaused()).toBe(true);

    const reader = stream.getReader();
    const first = await reader.read();
    const second = await reader.read();

    expect(new TextDecoder().decode(first.value)).toBe('first');
    expect(new TextDecoder().decode(second.value)).toBe('second');

    await reader.cancel();
    expect(input.destroyed).toBe(true);
  });

  it.effect(
    '[Given] bundled adapter packages [Then] it resolves to the bundled path without npx',
    () =>
      Effect.gen(function* () {
        const result = yield* resolveAcpAdapterCommand('claude');
        expect(result.source).toBe('bundled');
        expect(result.cmd[0]).toBe(process.execPath);
        expect(result.cmd[1]).toMatch(/claude-code-acp/);
      }).pipe(Effect.provide(BunContext.layer))
  );

  it.effect('[Given] bundled codex adapter [Then] it resolves to the bundled path', () =>
    Effect.gen(function* () {
      const result = yield* resolveAcpAdapterCommand('codex');
      expect(result.source).toBe('bundled');
      expect(result.cmd[0]).toBe(process.execPath);
      expect(result.cmd[1]).toMatch(/codex-acp/);
    }).pipe(Effect.provide(BunContext.layer))
  );

  it.effect(
    '[Given] a packaged install shipping the adapter [Then] it runs the shipped asset',
    () =>
      Effect.gen(function* () {
        const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-acp-shipped-'));
        const execPath = path.join(installDirectory, 'composio');
        for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
          fs.writeFileSync(path.join(installDirectory, fileName), '', 'utf8');
        }
        const adapterPath = path.join(installDirectory, 'acp-adapters', 'claude-code-acp.mjs');
        fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
        fs.writeFileSync(adapterPath, '', 'utf8');

        return yield* Effect.gen(function* () {
          const result = yield* resolveAcpAdapterCommand('claude', { execPath });
          expect(result.source).toBe('shipped');
          expect(result.cmd).toEqual([execPath, adapterPath]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }).pipe(Effect.provide(BunContext.layer))
  );

  it.effect(
    '[Given] a packaged install missing the ACP adapters [Then] it names the repair instead of falling back',
    () =>
      Effect.gen(function* () {
        const installDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-acp-missing-'));
        const execPath = path.join(installDirectory, 'composio');
        for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
          fs.writeFileSync(path.join(installDirectory, fileName), '', 'utf8');
        }

        return yield* Effect.gen(function* () {
          const error = yield* Effect.flip(resolveAcpAdapterCommand('claude', { execPath }));

          expect(error).toBeInstanceOf(MissingAcpAdapterAssetsError);
          expect(error.missingRelativePaths).toContain('acp-adapters/claude-code-acp.mjs');
          expect(error.message).toContain(
            `This Composio install cannot run a claude sub-agent: the ACP adapter files are missing from ${installDirectory}.`
          );
          expect(error.message).toContain("Run 'composio upgrade' to restore them");
          // Not an AcpInvokeError, so the helper runtime surfaces it to the user
          // instead of silently retrying through the legacy sub-agent.
          expect(isAcpInvokeError(error)).toBe(false);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => fs.rmSync(installDirectory, { recursive: true, force: true }))
          )
        );
      }).pipe(Effect.provide(BunContext.layer))
  );

  it('[Given] an ACP invoke error [Then] it is classified for fallback', () => {
    const error = new AcpInvokeError('initialize_failed', 'boom');
    expect(isAcpInvokeError(error)).toBe(true);
    expect(error.code).toBe('initialize_failed');
  });

  it('[Given] an ACP-like error from another bundle [Then] it is still classified for fallback', () => {
    const error = {
      name: 'AcpInvokeError',
      code: 'prompt_failed',
      message: 'boom',
    };

    expect(isAcpInvokeError(error)).toBe(true);
  });

  it('[Given] an unknown ACP error code [Then] it is not admitted into the fallback union', () => {
    const error = {
      name: 'AcpInvokeError',
      code: 'unexpected_failure',
      message: 'boom',
    };

    expect(isAcpInvokeError(error)).toBe(false);
  });

  it('[Given] a cancelled ACP prompt [Then] it remains fallback-eligible', () => {
    const error = new AcpInvokeError('prompt_failed', 'claude ACP prompt was cancelled.');

    expect(isAcpInvokeError(error)).toBe(true);
    expect(error.code).toBe('prompt_failed');
  });

  it('[Given] tokenized message chunks [Then] it emits buffered readable text', () => {
    const helperDebugLog = vi.fn();
    const logger = new BufferedChunkLogger('subAgent.acp.message', helperDebugLog);

    logger.push('Pick');
    logger.push(' one');
    logger.push(' fruit');
    logger.push(' from');
    logger.push(' the');
    logger.push(' mixed');
    logger.push(' box.');
    logger.flush();

    expect(helperDebugLog).toHaveBeenCalledWith('subAgent.acp.message', {
      text: 'Pick one fruit from the mixed box.',
    });
  });

  it('[Given] a read permission request [Then] it allows the read once', () => {
    const result = selectPermissionOutcome(
      {
        options: [
          { optionId: 'allow', kind: 'allow_once', name: 'Allow once' },
          { optionId: 'reject', kind: 'reject_once', name: 'Reject once' },
        ],
        toolCall: {
          toolCallId: 'tool-1',
          kind: 'read',
          title: 'Read File',
          rawInput: {
            file_path: '/tmp/composio/session/artifacts/emails.json',
          },
        },
      } as never,
      ['/tmp/composio/session', '/Users/test/.composio']
    );

    expect(result).toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow',
      },
    });
  });

  it('[Given] a non-read permission request [Then] it allows the request in permissive mode', () => {
    const result = selectPermissionOutcome(
      {
        options: [
          { optionId: 'allow-always', kind: 'allow_always', name: 'Allow always' },
          { optionId: 'allow-once', kind: 'allow_once', name: 'Allow once' },
          { optionId: 'reject', kind: 'reject_once', name: 'Reject once' },
        ],
        toolCall: {
          toolCallId: 'tool-2',
          kind: 'edit',
          title: 'Edit File',
          rawInput: {
            file_path: '/tmp/composio/session/artifacts/emails.json',
          },
        },
      } as never,
      ['/tmp/composio/session', '/Users/test/.composio']
    );

    expect(result).toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow-always',
      },
    });
  });

  it('[Given] a title-only read permission request [Then] it still allows the read once', () => {
    const result = selectPermissionOutcome(
      {
        options: [
          { optionId: 'allow', kind: 'allow_once', name: 'Allow once' },
          { optionId: 'reject', kind: 'reject_once', name: 'Reject once' },
        ],
        toolCall: {
          toolCallId: 'tool-3',
          kind: null,
          title: 'Read File',
          rawInput: {
            file_path: '/Users/test/.composio/tool_definitions/GMAIL_FETCH_EMAILS.json',
          },
        },
      } as never,
      ['/tmp/composio/session', '/Users/test/.composio']
    );

    expect(result).toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow',
      },
    });
  });

  it('[Given] an out-of-scope read request [Then] it still allows the read in permissive mode', () => {
    const result = selectPermissionOutcome(
      {
        options: [
          { optionId: 'allow-always', kind: 'allow_always', name: 'Allow always' },
          { optionId: 'allow', kind: 'allow_once', name: 'Allow once' },
          { optionId: 'reject', kind: 'reject_once', name: 'Reject once' },
        ],
        toolCall: {
          toolCallId: 'tool-4',
          kind: 'read',
          title: 'Read File',
          rawInput: {
            file_path: '/etc/passwd',
          },
        },
      } as never,
      ['/tmp/composio/session', '/Users/test/.composio']
    );

    expect(result).toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow-always',
      },
    });
  });

  it('[Given] a read-only terminal command over an allowed artifact path [Then] it allows the command once', () => {
    const result = selectPermissionOutcome(
      {
        options: [
          { optionId: 'allow', kind: 'allow_once', name: 'Allow once' },
          { optionId: 'reject', kind: 'reject_once', name: 'Reject once' },
        ],
        toolCall: {
          toolCallId: 'tool-5',
          kind: null,
          title:
            "`head -n 100 /tmp/composio/session/artifacts/emails.json | jq '.data' 2>/dev/null || head -n 100 /tmp/composio/session/artifacts/emails.json`",
          rawInput: {},
        },
      } as never,
      ['/tmp/composio/session', '/Users/test/.composio']
    );

    expect(result).toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow',
      },
    });
  });

  it.effect(
    '[Given] a structured schema [Then] it creates a stdio MCP server context for output capture',
    () =>
      Effect.gen(function* () {
        const helperDebugLog = vi.fn();
        const context = yield* createStructuredOutputMcpContext({
          options: {
            structuredSchema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
              },
              required: ['summary'],
            },
          },
          helperDebugLog,
        });

        expect(context).not.toBeNull();
        expect(context?.mcpServer.command).toBe(process.execPath);
        expect(context?.mcpServer.args).toEqual(
          expect.arrayContaining([
            expect.stringContaining('run-subagent-output-mcp'),
            '--schema-file',
            expect.stringContaining('schema.json'),
            '--result-file',
            expect.stringContaining('result.json'),
          ])
        );
        expect(context?.mcpServer.env).toEqual(
          expect.arrayContaining([{ name: 'BUN_BE_BUN', value: '1' }])
        );
        expect(context?.resultFilePath).toContain('result.json');
        expect(helperDebugLog).toHaveBeenCalledWith(
          'subAgent.acp.structured_output_tool',
          expect.objectContaining({
            modulePath: expect.stringContaining('run-subagent-output-mcp'),
          })
        );

        yield* context!.cleanup;
      }).pipe(Effect.provide(BunContext.layer))
  );
});
