import type {
  LogCreateToolExecutionResponse,
  LogRetrieveToolExecutionResponse,
} from '@composio/client/resources/logs';

export const log = {
  id: 'log_send_1',
  timestamp: '2026-01-01T00:00:00.000Z',
  type: 'tool.execution',
  status: 'success',
  level: 'info',
  metadata: {
    toolkit: { slug: 'gmail' },
    tool: { slug: 'GMAIL_SEND_EMAIL', version: '20260101_00' },
    connected_account_id: 'ca_gmail_1',
    user_id: 'user_1',
    credential_source: 'connected_account',
  },
  metrics: { duration_ms: 412 },
  parent: null,
} satisfies LogCreateToolExecutionResponse['logs'][number];

export const detail = {
  ...log,
  timings: { start_time: 1767225600000, end_time: 1767225600412 },
  context: {},
  source: {},
  data: { request: { payload: { to: 'a@b.c' } }, response: { body: { id: 'msg_1' } } },
} satisfies LogRetrieveToolExecutionResponse;
