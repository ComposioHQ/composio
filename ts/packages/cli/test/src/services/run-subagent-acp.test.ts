import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BufferedChunkLogger,
  createStructuredOutputMcpContext,
  resolveAcpAdapterCommand,
  selectPermissionOutcome,
} from 'src/services/run-subagent-acp';
import { AcpInvokeError, isAcpInvokeError } from 'src/services/run-subagent-shared';

describe('run-subagent-acp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[Given] bundled adapter packages [Then] it resolves to the bundled path without npx', () => {
    const result = resolveAcpAdapterCommand('claude');
    expect(result.source).toBe('bundled');
    expect(result.cmd[0]).toBe(process.execPath);
    expect(result.cmd[1]).toMatch(/claude-code-acp/);
  });

  it('[Given] bundled codex adapter [Then] it resolves to the bundled path', () => {
    const result = resolveAcpAdapterCommand('codex');
    expect(result.source).toBe('bundled');
    expect(result.cmd[0]).toBe(process.execPath);
    expect(result.cmd[1]).toMatch(/codex-acp/);
  });

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

  it('[Given] a structured schema [Then] it creates a stdio MCP server context for output capture', () => {
    const helperDebugLog = vi.fn();
    const context = createStructuredOutputMcpContext({
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

    context?.cleanup();
  });
});
