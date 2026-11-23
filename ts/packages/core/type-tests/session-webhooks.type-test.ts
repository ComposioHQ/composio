/**
 * `composio.sessions.webhooks.parse()` needs the secret and narrows the event,
 * and the answer types reject a misspelled or misplaced field.
 */
import { Composio } from '../src';
import type {
  SessionWebhookAfterExecuteResponse,
  SessionWebhookBeforeExecuteResponse,
  SessionWebhookHttpRequest,
  SessionWebhookToolCall,
} from '../src';

declare const composio: Composio;
declare const request: Request;

async function sessionWebhook(): Promise<void> {
  const hook = await composio.sessions.webhooks.parse({
    body: await request.text(),
    headers: request.headers,
    verifySecret: 'secret',
  });

  // @ts-expect-error the secret is required
  await composio.sessions.webhooks.parse({ body: '', headers: {} });

  if (hook.type === 'composio.session_hook.before_execute') {
    if (hook.data.type === 'tool_execute') {
      const call: SessionWebhookToolCall = hook.data.tool_call;
      const args: Record<string, unknown> = call.arguments;
      void args;
    } else {
      const request: SessionWebhookHttpRequest = hook.data.http_request;
      const endpoint: string = request.endpoint;
      const uploadedFile = request.binary_body;
      const url: string | undefined = uploadedFile?.url;
      const base64: string | undefined = uploadedFile?.base64;
      void [endpoint, url, base64];
    }
  } else if (hook.data.type === 'tool_execute') {
    const error: string | null = hook.data.tool_response.error;
    void error;
  } else {
    const status: number = hook.data.http_response.status;
    void status;
  }

  const allow: SessionWebhookBeforeExecuteResponse = { action: 'continue' };
  const change: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    override: { tool_call: { arguments: { bcc: ['compliance@acme.com'] } } },
  };
  const upload: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    override: { http_request: { binary_body: { base64: 'Zm9v' } }, tool_call: null },
  };
  const redact: SessionWebhookAfterExecuteResponse = {
    action: 'continue',
    override: { http_response: { data: null } },
  };
  const block: SessionWebhookAfterExecuteResponse = { action: 'block', message: 'Not allowed' };
  void [allow, change, upload, redact, block];

  const misplaced: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    // @ts-expect-error a result can only be changed in an after_execute answer
    override: { tool_response: { data: {} } },
  };
  const misspelled: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    // @ts-expect-error not a field of the answer
    overide: null,
  };
  const bothCalls: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    // @ts-expect-error an answer changes the tool call or the proxy call, not both
    override: { tool_call: { arguments: {} }, http_request: { endpoint: '/user' } },
  };
  const bothResults: SessionWebhookAfterExecuteResponse = {
    action: 'continue',
    // @ts-expect-error an answer changes the tool result or the proxy response, not both
    override: { tool_response: { data: {} }, http_response: { data: null } },
  };
  const bothBodies: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    // @ts-expect-error a proxy override sets the JSON body or the file
    override: { http_request: { body: {}, binary_body: { url: 'https://example.com/file' } } },
  };
  const bothFileInputs: SessionWebhookBeforeExecuteResponse = {
    action: 'continue',
    override: {
      // @ts-expect-error a file uses a URL or base64
      http_request: { binary_body: { url: 'https://example.com/file', base64: 'Zm9v' } },
    },
  };
  // @ts-expect-error a block needs a message for the agent
  const silent: SessionWebhookAfterExecuteResponse = { action: 'block' };
  void [misplaced, misspelled, bothCalls, bothResults, bothBodies, bothFileInputs, silent];
}

void sessionWebhook;
