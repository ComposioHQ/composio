import { expect, test } from 'bun:test';
import { EXAMPLE_SOURCES } from '../../lib/example-sources';

test('standup helpers reuse sessions and pin proxy calls to the account owner', async () => {
  const source = EXAMPLE_SOURCES.standup.find(file => file.path === 'api/_utils/composio.ts')!;
  const created: Array<{ userId: string; config: Record<string, unknown> }> = [];
  const calls: Array<{ kind: string; userId: string; args: unknown[] }> = [];
  let failed = false;
  let blocked = false;
  const client = {
    connectedAccounts: {
      list: async () => ({ items: [{ id: 'ca_bot' }] }),
      get: async (id: string) => ({
        id,
        toolkit: { slug: id === 'ca_bot' ? 'slackbot' : 'slack' },
      }),
    },
    create: async (userId: string, config: Record<string, unknown>) => {
      created.push({ userId, config });
      return {
        execute: async (...args: unknown[]) => {
          calls.push({ kind: 'execute', userId, args });
          return { resultType: failed ? 'failed' : 'completed', data: { ok: true }, error: null };
        },
        proxyExecute: async (...args: unknown[]) => {
          calls.push({ kind: 'proxy', userId, args });
          return blocked ? { resultType: 'blocked' } : { status: 200, data: { ok: true } };
        },
      };
    },
  };
  // Execute the displayed source, replacing only its imports and SDK construction.
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    source.contents.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''),
  );
  const helpers = new Function('Composio', 'VercelProvider', 'env', 'TOOLKIT_SLUGS',
    `${code}\nreturn { slackTool, slackApi };`)(
    class { constructor() { return client; } }, class {}, { COMPOSIO_API_KEY: 'test' }, [],
  );

  await helpers.slackTool('SLACKBOT_SEND_MESSAGE', { channel: 'C123' });
  await helpers.slackTool('SLACKBOT_UPDATES_A_MESSAGE', { channel: 'C123' });
  expect(created).toHaveLength(1);
  expect(calls[0]).toEqual({ kind: 'execute', userId: 'default', args: ['SLACKBOT_SEND_MESSAGE', { channel: 'C123' }] });

  await helpers.slackApi('/views.open', 'POST', { trigger_id: 'T123' });
  await helpers.slackApi('/chat.postMessage', 'POST', { text: 'hello' }, 'ca_member', 'member');
  expect(created.slice(1)).toEqual([
    { userId: 'default', config: { toolkits: ['slackbot'], connectedAccounts: { slackbot: ['ca_bot'] }, manageConnections: false, sandbox: { enable: false } } },
    { userId: 'member', config: { toolkits: ['slack'], connectedAccounts: { slack: ['ca_member'] }, manageConnections: false, sandbox: { enable: false } } },
  ]);
  expect(calls.at(-1)?.userId).toBe('member');

  failed = true;
  await expect(helpers.slackTool('SLACKBOT_SEND_MESSAGE', {})).rejects.toThrow('Slack tool failed');
  blocked = true;
  await expect(helpers.slackApi('/views.open', 'POST')).rejects.toThrow('Session proxy request blocked');
});
