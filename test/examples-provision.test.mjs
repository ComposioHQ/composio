import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/examples-provision.mjs', import.meta.url), 'utf8');

test('starts managed OAuth through a link session', () => {
  assert.match(source, /'POST', '\/api\/v3\/connected_accounts\/link'/);
  assert.match(source, /auth_config_id: config\.id/);
  assert.match(source, /user_id: USER_ID/);
  assert.doesNotMatch(source, /'POST', '\/api\/v3\.1\/connected_accounts', \{/);
});
