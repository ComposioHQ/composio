/** Unattended CI verification, restricted to the read-only tools in session.ts. */
import assert from 'node:assert/strict';
import { type ToolRouterInputResponse } from '@composio/core';
import { runWithApprovals } from './approval';
import {
  createApprovalSession,
  createComposio,
  multiArguments,
  tool,
  toolArguments,
} from './session';
import { assertBatch, assertDenied } from './verification';

const composio = createComposio();
const cases: [string, ToolRouterInputResponse, boolean][] = [
  ['approve', { action: 'accept', content: { decision: 'approve' } }, true],
  ['deny', { action: 'accept', content: { decision: 'deny' } }, false],
  ['decline', { action: 'decline' }, false],
  ['cancel', { action: 'cancel' }, false],
  ['always_approve', { action: 'accept', content: { decision: 'always_approve' } }, true],
];

for (const [label, answer, allowed] of cases) {
  // Fresh sessions prevent Always approve from affecting other cases.
  const session = await createApprovalSession(composio);
  try {
    let prompts = 0;
    const result = await runWithApprovals(
      options => session.execute(tool, toolArguments, options),
      async () => {
        assert.ok(++prompts <= 2, 'Approval did not resolve');
        return answer;
      }
    );
    assert.ok(prompts > 0, 'Execution bypassed approval');
    assert.equal(result.resultType, allowed ? 'completed' : 'failed');
    if (allowed) {
      assert.equal(result.error, null);
      assert.ok(Object.keys(result.data).length > 0);
    } else assertDenied(result.error);
    if (label === 'always_approve') {
      const next = await runWithApprovals(
        options => session.execute(tool, { username: 'dang' }, options),
        async () => {
          throw new Error('Always approve asked again in the same session');
        }
      );
      assert.equal(next.resultType, 'completed');
      assert.equal(next.error, null);
      assert.ok(Object.keys(next.data).length > 0);
    }
    console.log(`PASS ${label}`);
  } finally {
    await composio.sessions.delete(session.sessionId);
  }
}

const session = await createApprovalSession(composio);
try {
  let prompts = 0;
  const result = await runWithApprovals(
    options => session.executeMeta('COMPOSIO_MULTI_EXECUTE_TOOL', multiArguments, options),
    async () => {
      assert.ok(++prompts <= 2, 'Batch approval did not resolve');
      return { action: 'accept', content: { decision: prompts === 1 ? 'approve' : 'deny' } };
    }
  );
  assert.equal(prompts, 2, 'Expected a question for each tool call');
  assertBatch(result.data, 1, 1);
  console.log('PASS batch with one approval and one denial');
} finally {
  await composio.sessions.delete(session.sessionId);
}
