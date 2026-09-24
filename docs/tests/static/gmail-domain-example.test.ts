import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { z } from 'zod';

// Exercise the published snippet itself without opening OAuth or making API calls.
const page = readFileSync(
  new URL('../../content/examples/restrict-gmail-domain.mdx', import.meta.url),
  'utf8',
);
const source = page.match(/```typescript title="restrict-gmail.ts"\n([\s\S]*?)\n```/)?.[1];
if (!source) throw new Error('Missing runnable TypeScript example');
const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(
  source.replace(/^import .*;\n/gm, ''),
);

const cases = [
  { name: 'allowed domain', data: { emailAddress: 'alice@example.com' }, approved: true },
  { name: 'mixed case', data: { emailAddress: 'alice@EXAMPLE.COM' }, approved: true },
  { name: 'personal Gmail', data: { emailAddress: 'alice@gmail.com' }, approved: false },
  { name: 'suffix match', data: { emailAddress: 'alice@notexample.com' }, approved: false },
  { name: 'subdomain', data: { emailAddress: 'alice@sub.example.com' }, approved: false },
  { name: 'extra suffix', data: { emailAddress: 'alice@example.com.evil.test' }, approved: false },
  { name: 'missing email', data: {}, approved: false },
  { name: 'null profile', data: null, approved: false },
  { name: 'non-string email', data: { emailAddress: 42 }, approved: false },
  { name: 'empty local part', data: { emailAddress: '@example.com' }, approved: false },
  { name: 'multiple at signs', data: { emailAddress: 'alice@other@example.com' }, approved: false },
  { name: 'display-name syntax', data: { emailAddress: 'Alice <alice@example.com>' }, approved: false },
  { name: 'whitespace', data: { emailAddress: 'alice @example.com' }, approved: false },
];

for (const scenario of cases) {
  test(`Gmail domain example: ${scenario.name}`, async () => {
    await checkExample(scenario.data, scenario.approved);
  });
}

test('Gmail domain example rejects upstream errors and cleanup failures', async () => {
  await checkExample({ emailAddress: 'alice@example.com' }, false, 'proxy');
  await checkExample({ emailAddress: 'alice@example.com' }, false, 'status');
  await checkExample({ emailAddress: 'alice@example.com' }, false, 'timeout');
  await checkExample({ emailAddress: 'alice@gmail.com' }, false, 'disable');
});

async function checkExample(
  data: unknown,
  approved: boolean,
  failure?: 'proxy' | 'status' | 'timeout' | 'disable',
) {
  const events: string[] = [];
  const accountId = 'ca_new_connection';
  class Composio {
    connectedAccounts = {
      disable: async (id: string) => {
        expect(id).toBe(accountId);
        events.push('disable');
        if (failure === 'disable') throw new Error('disable failed');
      },
    };
    tools = {
      proxyExecute: async (params: Record<string, unknown>) => {
        expect(params).toEqual({
          endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
          method: 'GET',
          connectedAccountId: accountId,
        });
        events.push('profile');
        if (failure === 'proxy') throw new Error('network failure');
        return { status: failure === 'status' ? 403 : 200, data };
      },
    };
    async create(userId: string, config: Record<string, unknown>) {
      expect(userId).toBe('demo');
      expect(config.toolkits).toEqual(['gmail']);
      expect(config.manageConnections).toBe(false);
      expect(config.sandbox).toEqual({ enable: false });
      if (events.length === 0) {
        events.push('onboarding');
      } else {
        expect(approved).toBe(true);
        expect(events).toEqual(['onboarding', 'wait', 'profile']);
        expect(config.connectedAccounts).toEqual({ gmail: [accountId] });
        events.push('agent-session');
      }
      return {
        authorize: async (toolkit: string) => {
          expect(toolkit).toBe('gmail');
          return {
            id: accountId,
            redirectUrl: 'https://example.test/connect',
            waitForConnection: async (timeout: number) => {
              expect(timeout).toBe(300_000);
              events.push('wait');
              if (failure === 'timeout') throw new Error('timed out');
              return { id: accountId };
            },
          };
        },
        tools: async () => {
          expect(events.at(-1)).toBe('agent-session');
          events.push('tools');
          return [];
        },
      };
    }
  }
  const userId = process.env.COMPOSIO_USER_ID;
  process.env.COMPOSIO_USER_ID = 'demo';
  const fixturePath = `${import.meta.dir}/.gmail-domain-example-${crypto.randomUUID()}.mjs`;
  Object.assign(globalThis, { __gmailDomainExample: { Composio, z } });
  await Bun.write(
    fixturePath,
    `const { Composio, z } = globalThis.__gmailDomainExample;\nconst console = { log() {} };\n${compiled}`,
  );
  try {
    const result = import(fixturePath);
    if (approved) {
      await result;
      expect(events).toEqual(['onboarding', 'wait', 'profile', 'agent-session', 'tools']);
    } else {
      await expect(result).rejects.toThrow(failure === 'disable' ? 'disable failed' : 'Connection disabled');
      expect(events.at(-1)).toBe('disable');
      expect(events).not.toContain('agent-session');
      expect(events).not.toContain('tools');
    }
  } finally {
    await rm(fixturePath, { force: true });
    delete (globalThis as { __gmailDomainExample?: unknown }).__gmailDomainExample;
    if (userId === undefined) {
      delete process.env.COMPOSIO_USER_ID;
    } else {
      process.env.COMPOSIO_USER_ID = userId;
    }
  }
}
