import { describe, expect, it } from 'vitest';
import { buildToolLogShorthandSearchParams } from 'src/commands/logs-cmd/commands/logs.tools.cmd';

describe('buildToolLogShorthandSearchParams', () => {
  it('[Given] no filters [Then] returns empty search params', () => {
    expect(buildToolLogShorthandSearchParams({})).toEqual([]);
  });

  it('[Given] all supported filters [Then] maps each one to the expected backend key', () => {
    const output = buildToolLogShorthandSearchParams({
      tool: 'GMAIL_SEND_EMAIL',
      toolkit: 'gmail',
      connectedAccountId: 'ca_123',
      authConfigId: 'ac_123',
      status: 'success',
      userId: 'user_123',
      logId: 'log_123',
      toolRouterSessionId: 'trs_123',
      sessionId: 'sess_123',
    });

    expect(output).toEqual([
      { field: 'action_key', operation: '==', value: 'GMAIL_SEND_EMAIL' },
      { field: 'toolkit_key', operation: '==', value: 'gmail' },
      { field: 'connected_account_id', operation: '==', value: 'ca_123' },
      { field: 'auth_config_id', operation: '==', value: 'ac_123' },
      { field: 'execution_status', operation: '==', value: 'success' },
      { field: 'user_id', operation: '==', value: 'user_123' },
      { field: 'log_id', operation: '==', value: 'log_123' },
      { field: 'tool_router_session_id', operation: '==', value: 'trs_123' },
      { field: 'session_id', operation: '==', value: 'sess_123' },
    ]);
  });

  it('[Given] comma-separated filter values [Then] expands each value into separate search params', () => {
    const output = buildToolLogShorthandSearchParams({
      tool: 'GMAIL_SEND_EMAIL,SLACK_SEND_MESSAGE',
      toolkit: 'gmail,slack',
      status: 'success,failed',
      logId: 'log_1,log_2',
    });

    expect(output).toEqual([
      { field: 'action_key', operation: '==', value: 'GMAIL_SEND_EMAIL' },
      { field: 'action_key', operation: '==', value: 'SLACK_SEND_MESSAGE' },
      { field: 'toolkit_key', operation: '==', value: 'gmail' },
      { field: 'toolkit_key', operation: '==', value: 'slack' },
      { field: 'execution_status', operation: '==', value: 'success' },
      { field: 'execution_status', operation: '==', value: 'failed' },
      { field: 'log_id', operation: '==', value: 'log_1' },
      { field: 'log_id', operation: '==', value: 'log_2' },
    ]);
  });
});
