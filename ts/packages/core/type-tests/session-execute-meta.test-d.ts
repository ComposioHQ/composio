/** `session.executeMeta()` is callable on the sessions `create()` and `use()` return. */
import { Composio } from '../src';
import type { ToolRouterSessionExecuteResponse } from '../src';

declare const composio: Composio;

async function sessionExecuteMeta(): Promise<void> {
  const session = await composio.create('user_123');
  const result: ToolRouterSessionExecuteResponse = await session.executeMeta(
    'COMPOSIO_SEARCH_TOOLS',
    { queries: [{ use_case: 'send an email' }] }
  );
  void result;
  await session.executeMeta('COMPOSIO_MANAGE_CONNECTIONS');
  await session.executeMeta(
    'COMPOSIO_SEARCH_TOOLS',
    {},
    {},
    { signal: new AbortController().signal }
  );
  await session.executeMeta(
    'COMPOSIO_MULTI_EXECUTE_TOOL',
    { tools: [] },
    {
      inputResponses: { elicit_1: { action: 'accept', content: { decision: 'approve' } } },
      requestState: 'state',
    }
  );

  // @ts-expect-error only meta tool slugs are accepted
  await session.executeMeta('GMAIL_SEND_EMAIL');

  const withMcp = await composio.create('user_123', { mcp: true });
  await withMcp.executeMeta('COMPOSIO_SEARCH_TOOLS');

  const reused = await composio.use('session_123');
  await reused.executeMeta('COMPOSIO_SEARCH_TOOLS');
}

void sessionExecuteMeta;
