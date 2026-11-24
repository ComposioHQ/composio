import { Composio } from '../src';
import type { ToolRouterHook, ToolRouterHookResult } from '../src';

declare const composio: Composio;
declare const result: ToolRouterHookResult;

async function sessionHooksWithWebhook(): Promise<void> {
  const hooks: ToolRouterHook[] = [
    {
      type: 'before_execute',
      id: 'check_outgoing_email',
      appliesTo: { toolkits: ['gmail'] },
      handler: { type: 'webhook', fallbackAction: 'block', timeoutMs: 2000 },
    },
    {
      type: 'after_execute',
      id: 'redact_results',
      appliesTo: 'all',
      handler: { type: 'webhook', fallbackAction: 'continue' },
    },
  ];
  const session = await composio.sessions.create('user_123', { hooks });
  await session.update({ hooks });

  await composio.sessions.create('user_123', {
    hooks: [
      {
        type: 'before_execute',
        id: 'check_outgoing_email',
        appliesTo: 'all',
        // @ts-expect-error a webhook handler needs a fallbackAction
        handler: { type: 'webhook' },
      },
    ],
  });

  if (result.status === 'unavailable') {
    const detail: string | undefined = result.detail;
    void detail;
  }
}

void sessionHooksWithWebhook;
