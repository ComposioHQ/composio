/**
 * E2E fixture: session.update() with default options against the live API.
 *
 * Reproduces the @composio/core 0.20.0 regression: update() sent
 * `expected_config_version` on every call, and the API rejected the field with
 * a 400, so no default update could succeed. Mocked unit tests could not see
 * this because they never reach the API's payload validation.
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

const toolkitsOf = config => JSON.stringify(config.toolkits);

async function main() {
  const userId = `e2e-tool-router-session-update-${Date.now()}`;
  const session = await composio.sessions.create(userId, { toolkits: ['github', 'gmail'] });

  try {
    const versionBefore = session.configVersion;
    if (typeof versionBefore !== 'number') {
      throw new Error(`expected a numeric configVersion after create, got ${versionBefore}`);
    }
    console.log('CREATE_OK');

    // Default options: no precondition, so this must succeed on any project.
    const config = await session.update({ toolkits: ['github'] });
    const expected = JSON.stringify({ enabled: ['github'] });
    if (toolkitsOf(config) !== expected) {
      throw new Error(`update returned toolkits ${toolkitsOf(config)}, expected ${expected}`);
    }
    if (!(session.configVersion > versionBefore)) {
      throw new Error(
        `configVersion did not advance: ${versionBefore} -> ${session.configVersion}`
      );
    }
    console.log('UPDATE_OK');

    const reread = await composio.sessions.use(session.sessionId);
    if (toolkitsOf(reread.config) !== expected) {
      throw new Error(`server kept toolkits ${toolkitsOf(reread.config)}, expected ${expected}`);
    }
    if (reread.configVersion !== session.configVersion) {
      throw new Error(
        `server configVersion ${reread.configVersion} != local ${session.configVersion}`
      );
    }
    console.log('PERSISTED_OK');
  } finally {
    await composio.sessions.delete(session.sessionId);
    console.log('DELETE_OK');
  }

  console.log('ALL_OK');
}

main().catch(err => {
  console.log('ERROR:', err?.message || err);
  process.exit(1);
});
