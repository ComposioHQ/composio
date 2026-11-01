/**
 * E2E fixture: the proxyExecute session option against the live API.
 *
 * Covers sessions.create() and session.update() with the boolean shorthand,
 * the { enable } block, and null, and checks what the session lists.
 *
 * Requires COMPOSIO_API_KEY in environment.
 */
import { Composio } from '@composio/core';

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error('COMPOSIO_API_KEY is required');
  process.exit(1);
}

const composio = new Composio({ apiKey });
const META_TOOL = 'COMPOSIO_PROXY_EXECUTE';

const toolNames = async session => (await session.tools()).map(tool => tool.function.name);
const enableOf = config => config.proxy_execute?.enable;

const expectEnable = (label, config, expected) => {
  const actual = enableOf(config);
  if (actual !== expected) {
    throw new Error(`${label}: proxy_execute.enable is ${actual}, expected ${expected}`);
  }
};

const expectListed = async (label, session, expected) => {
  const names = await toolNames(session);
  if (names.includes(META_TOOL) !== expected) {
    throw new Error(
      `${label}: ${META_TOOL} ${expected ? 'missing from' : 'present in'} ${names.join(',')}`
    );
  }
};

async function main() {
  const userId = `e2e-tool-router-proxy-execute-${Date.now()}`;
  const sessions = [];

  try {
    const on = await composio.sessions.create(userId, { toolkits: ['github'], proxyExecute: true });
    sessions.push(on);
    expectEnable('create(true)', on.config, true);
    await expectListed('create(true)', on, true);
    console.log('CREATE_ON_OK');

    expectEnable('update(false)', await on.update({ proxyExecute: false }), false);
    await expectListed('update(false)', on, false);
    console.log('UPDATE_OFF_OK');

    expectEnable(
      'update({ enable: true })',
      await on.update({ proxyExecute: { enable: true } }),
      true
    );
    expectEnable('update(null)', await on.update({ proxyExecute: null }), undefined);
    const reread = await composio.sessions.use(on.sessionId);
    expectEnable('use() after update(null)', reread.config, undefined);
    console.log('UPDATE_NULL_OK');

    const off = await composio.sessions.create(userId, { toolkits: ['github'] });
    sessions.push(off);
    expectEnable('create()', off.config, undefined);
    await expectListed('create()', off, false);
    console.log('DEFAULT_OK');

    let rejected = false;
    try {
      const conflict = await composio.sessions.create(userId, {
        toolkits: ['github'],
        proxyExecute: false,
        sandbox: { enableProxyExecution: true },
      });
      sessions.push(conflict);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(
        'create(false + sandbox.enableProxyExecution) was accepted, expected a rejection'
      );
    }
    console.log('CONFLICT_REJECTED_OK');
  } finally {
    for (const session of sessions) {
      await composio.sessions.delete(session.sessionId);
    }
    console.log('DELETE_OK');
  }

  console.log('ALL_OK');
}

main().catch(err => {
  console.log('ERROR:', err?.message || err);
  process.exit(1);
});
