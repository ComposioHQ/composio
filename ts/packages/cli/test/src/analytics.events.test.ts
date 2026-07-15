import { describe, expect, it } from 'vitest';
import { createCliCodactFailureBody } from 'src/analytics/dispatch';
import {
  getToolExecuteFailedEvent,
  getToolExecuteToolNotFoundEvent,
  getToolExecuteValidationFailedEvent,
  isMaybeToolNotFoundError,
  isMaybeToolValidationError,
} from 'src/analytics/events';
import { ToolInputValidationError } from 'src/services/tool-input-validation';

describe('CLI analytics execute failure events', () => {
  it('marks cached-schema validation failures as fast_fail', () => {
    const error = new ToolInputValidationError('GMAIL_SEND_EMAIL', '/tmp/schema.json', [
      'Unknown key "recipient"',
    ]);

    const event = getToolExecuteValidationFailedEvent({
      toolSlug: 'GMAIL_SEND_EMAIL',
      args: { recipient: 'a@example.com' },
      error,
      surface: 'root',
      projectMode: 'consumer',
      stage: 'validation',
      failureOrigin: 'fast_fail',
    });

    expect(event).not.toBeNull();
    expect(event!.properties?.failure_origin).toBe('fast_fail');
    expect(event!.properties?.tool_log_id).toBeUndefined();
  });

  it('marks endpoint tool-not-found failures as main_endpoint and keeps log id', () => {
    const event = getToolExecuteToolNotFoundEvent({
      toolSlug: 'FAKE_TOOL',
      args: {},
      surface: 'root',
      projectMode: 'consumer',
      stage: 'execution',
      failureOrigin: 'main_endpoint',
      logId: 'log_123',
      message: 'Tool not found',
      status: 404,
    });

    expect(event).not.toBeNull();
    expect(event!.properties?.failure_origin).toBe('main_endpoint');
    expect(event!.properties?.tool_log_id).toBe('log_123');
  });

  it('marks endpoint execution failures as main_endpoint and keeps log id', () => {
    const event = getToolExecuteFailedEvent({
      toolSlug: 'GMAIL_SEND_EMAIL',
      args: { to: 'a@example.com' },
      surface: 'root',
      projectMode: 'consumer',
      stage: 'execution',
      failureOrigin: 'main_endpoint',
      logId: 'log_456',
      message: 'Invalid tool arguments',
    });

    expect(event).not.toBeNull();
    expect(event!.properties?.failure_origin).toBe('main_endpoint');
    expect(event!.properties?.tool_log_id).toBe('log_456');
  });

  it('classifies known Hermes tool-not-found codes', () => {
    expect(
      isMaybeToolNotFoundError({
        apiCode: 2306,
        message: 'random',
      })
    ).toBe(true);
    expect(
      isMaybeToolNotFoundError({
        apiCode: 3703,
        message: 'random',
      })
    ).toBe(true);
  });

  it('classifies known Hermes validation codes', () => {
    expect(
      isMaybeToolValidationError({
        apiCode: 3702,
        message: 'random',
      })
    ).toBe(true);
    expect(
      isMaybeToolValidationError({
        apiCode: 1149,
        message: 'random',
      })
    ).toBe(true);
  });

  it('builds the CLI codact failure body using backend field names', () => {
    const body = createCliCodactFailureBody({
      failureType: 'wrong_tool_slug',
      toolInfo: {
        toolkit: 'github',
      },
      ctx: {
        invalid_tool_slug: 'GITHUB_MAKE_ISSUE',
      },
      session: {
        command_path: 'execute',
      },
      requestId: 'req_123',
    });

    expect(body).toMatchObject({
      failure_type: 'wrong_tool_slug',
      tool_info: {
        toolkit: 'github',
      },
      ctx: {
        invalid_tool_slug: 'GITHUB_MAKE_ISSUE',
      },
      session: {
        source: 'cli',
        command_path: 'execute',
        cli_version: expect.any(String),
      },
      request_id: 'req_123',
    });
  });
});
