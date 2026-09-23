/**
 * Manual verification for saved Session configs.
 *
 * Runs each check against a real project and prints PASS or FAIL. Any failure
 * sets a non-zero exit code. Sessions created here are deleted at the end.
 *
 * Required environment:
 * - COMPOSIO_API_KEY: a project with Session configs enabled
 * - SESSION_CONFIG_ID: an active `sc_…` config in that project
 * - ARCHIVED_SESSION_CONFIG_ID: an archived `sc_…` config in that project
 *
 * Optional:
 * - COMPOSIO_API_KEY_NO_FEATURE: a project without Session configs (403 check)
 *
 * Run: pnpm start:session-configs
 */
import { APIError } from '@composio/client';
import { Composio, SessionPreset, type SessionConfigPolicy } from '@composio/core';
import 'dotenv/config';
import { cleanupVerificationSessions, listAllSessionConfigs } from './session-config-verification';

const required = ['COMPOSIO_API_KEY', 'SESSION_CONFIG_ID', 'ARCHIVED_SESSION_CONFIG_ID'] as const;
const missing = required.filter(name => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const sessionConfigId = process.env.SESSION_CONFIG_ID!;
const archivedSessionConfigId = process.env.ARCHIVED_SESSION_CONFIG_ID!;
const noFeatureApiKey = process.env.COMPOSIO_API_KEY_NO_FEATURE;
const userId = `session-configs-check-${Date.now()}`;

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const createdSessionIds: string[] = [];
let failures = 0;

async function check(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`PASS  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${label}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** HTTP status of a client error, or undefined for anything else. */
function statusOf(error: unknown): number | undefined {
  return error instanceof APIError ? error.status : undefined;
}

async function expectStatus(status: number, run: () => Promise<unknown>): Promise<void> {
  let result: unknown;
  try {
    result = await run();
  } catch (error) {
    assert(statusOf(error) === status, `expected ${status}, got ${statusOf(error) ?? error}`);
    return;
  }
  throw new Error(`expected ${status}, but the call succeeded with ${JSON.stringify(result)}`);
}

/** The saved policy uses enable/disable; the session snapshot uses enabled/disabled. */
function toolkitsAsSnapshot(policy: SessionConfigPolicy): unknown {
  if (!policy.toolkits) return undefined;
  return 'enable' in policy.toolkits
    ? { enabled: policy.toolkits.enable }
    : { disabled: policy.toolkits.disable };
}

function sameToolkits(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main(): Promise<void> {
  let policy: SessionConfigPolicy | undefined;

  await check('list() returns the active config', async () => {
    const items = await listAllSessionConfigs(composio.sessionConfigs);
    assert(
      items.some(item => item.id === sessionConfigId),
      `${sessionConfigId} missing from active configs`
    );
  });

  await check('list({ archived: true }) returns only archived configs', async () => {
    const items = await listAllSessionConfigs(composio.sessionConfigs, { archived: true });
    assert(
      items.some(item => item.id === archivedSessionConfigId),
      `${archivedSessionConfigId} missing`
    );
    assert(!items.some(item => item.id === sessionConfigId), `${sessionConfigId} is listed`);
    assert(
      items.every(item => item.archived),
      'a non-archived config is listed'
    );
  });

  await check('get() returns the policy', async () => {
    const sessionConfig = await composio.sessionConfigs.get(sessionConfigId);
    assert(sessionConfig.id === sessionConfigId, `got ${sessionConfig.id}`);
    policy = sessionConfig.config;
    console.log(`      policy: ${JSON.stringify(policy)}`);
  });

  await check('create() from the config sets sourceSessionConfig and its access', async () => {
    const session = await composio.sessions.create(userId, {
      experimental: { sessionConfigId },
    });
    createdSessionIds.push(session.sessionId);
    assert(
      session.experimental.sourceSessionConfig?.id === sessionConfigId,
      `sourceSessionConfig is ${JSON.stringify(session.experimental.sourceSessionConfig)}`
    );
    assert(policy, 'policy was not read');
    assert(
      sameToolkits(session.config.toolkits, toolkitsAsSnapshot(policy)),
      `session toolkits ${JSON.stringify(session.config.toolkits)} do not match the policy`
    );
    const tools = await session.tools();
    console.log(`      tools(): ${tools.length} tools`);
  });

  let narrowedSessionId: string | undefined;
  await check('update() applies the config to a broad inline session', async () => {
    const session = await composio.sessions.create(userId, {
      toolkits: ['github', 'gmail', 'slack', 'googlecalendar'],
    });
    createdSessionIds.push(session.sessionId);
    await session.update({ experimental: { sessionConfigId } });
    narrowedSessionId = session.sessionId;
    assert(
      session.experimental.sourceSessionConfig?.id === sessionConfigId,
      `sourceSessionConfig is ${JSON.stringify(session.experimental.sourceSessionConfig)}`
    );
    assert(policy, 'policy was not read');
    assert(
      sameToolkits(session.config.toolkits, toolkitsAsSnapshot(policy)),
      `session toolkits ${JSON.stringify(session.config.toolkits)} do not match the policy`
    );
  });

  await check('create() with an archived config fails with 404', () =>
    expectStatus(404, () =>
      composio.sessions.create(userId, {
        experimental: { sessionConfigId: archivedSessionConfigId },
      })
    )
  );

  await check('create() with a missing config fails with 404', () =>
    expectStatus(404, () =>
      composio.sessions.create(userId, {
        experimental: { sessionConfigId: 'sc_doesnotexist' },
      })
    )
  );

  await check('update() with an archived config fails with 404 and changes nothing', async () => {
    assert(narrowedSessionId, 'the narrowed session was not created');
    const before = await composio.sessions.use(narrowedSessionId);
    await expectStatus(404, () =>
      before.update({ experimental: { sessionConfigId: archivedSessionConfigId } })
    );
    const after = await composio.sessions.use(narrowedSessionId);
    assert(
      JSON.stringify(after.config) === JSON.stringify(before.config),
      'config changed after a failed update'
    );
    assert(
      after.experimental.sourceSessionConfig?.id === before.experimental.sourceSessionConfig?.id,
      'sourceSessionConfig changed after a failed update'
    );
  });

  if (noFeatureApiKey) {
    await check('list() without the feature fails with 403', () =>
      expectStatus(403, () => new Composio({ apiKey: noFeatureApiKey }).sessionConfigs.list())
    );
  } else {
    console.log('SKIP  list() without the feature (COMPOSIO_API_KEY_NO_FEATURE not set)');
  }

  // Informational: records whether the direct tools preset works with a saved
  // config. The SDK surfaces a backend rejection unchanged either way.
  try {
    const session = await composio.sessions.create(userId, {
      sessionPreset: SessionPreset.DIRECT_TOOLS,
      experimental: { sessionConfigId },
    });
    createdSessionIds.push(session.sessionId);
    console.log('INFO  DIRECT_TOOLS with a saved config: accepted');
  } catch (error) {
    console.log(
      `INFO  DIRECT_TOOLS with a saved config: rejected with ${statusOf(error) ?? 'no status'}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

main()
  .catch(error => {
    failures += 1;
    console.error(error);
  })
  .finally(async () => {
    await check('delete all created Sessions', () =>
      cleanupVerificationSessions(createdSessionIds, id => composio.sessions.delete(id))
    );
    console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
