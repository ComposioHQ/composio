import { describe, expect, test } from 'bun:test';
import {
  ComposioToolInputRequiredError,
  type ToolRouterInputRequest,
  type ToolRouterInputResponse,
} from '@composio/core';
import { askForApproval, runWithApprovals } from '../src/approval';
import { assertBatch } from '../src/verification';

const question: ToolRouterInputRequest = {
  type: 'elicitation',
  mode: 'form',
  message: 'Allow this read-only call?',
  requestedSchema: {
    type: 'object',
    properties: {
      decision: {
        type: 'string',
        oneOf: [{ const: 'approve' }, { const: 'always_approve' }, { const: 'deny' }],
      },
    },
    required: ['decision'],
  },
};

describe('terminal approvals', () => {
  test.each(['approve', 'always_approve', 'deny', 'decline', 'cancel'])(
    'forwards the person’s %s choice',
    async choice => {
      const response = await askForApproval(
        question,
        async () => choice,
        () => {}
      );
      expect(response).toEqual(
        choice === 'decline' || choice === 'cancel'
          ? { action: choice }
          : { action: 'accept', content: { decision: choice } }
      );
    }
  );

  test('rejects an invalid choice and asks again', async () => {
    const answers = ['yes', 'approve'];
    let reads = 0;
    expect(
      await askForApproval(
        question,
        async () => answers[reads++],
        () => {}
      )
    ).toEqual({ action: 'accept', content: { decision: 'approve' } });
    expect(reads).toBe(2);
  });

  test('uses the schema choices instead of adding Always approve', async () => {
    const answers = ['always_approve', 'deny'];
    const restricted = {
      ...question,
      requestedSchema: {
        type: 'object',
        properties: { decision: { type: 'string', enum: ['approve', 'deny'] } },
      },
    };
    let reads = 0;
    expect(
      await askForApproval(
        restricted,
        async () => answers[reads++],
        () => {}
      )
    ).toEqual({ action: 'accept', content: { decision: 'deny' } });
    expect(reads).toBe(2);
  });
});

test('waits for consent before resuming the call', async () => {
  let release!: (answer: ToolRouterInputResponse) => void;
  const consent = new Promise<ToolRouterInputResponse>(resolve => {
    release = resolve;
  });
  let calls = 0;
  const pending = runWithApprovals(
    async options => {
      calls++;
      if (!options.inputResponses)
        throw new ComposioToolInputRequiredError('Read', {
          inputRequests: { random_id: question },
          requestState: 'opaque-token',
        });
      expect(options).toEqual({
        inputResponses: { random_id: { action: 'cancel' } },
        requestState: 'opaque-token',
      });
      return 'cancelled';
    },
    () => consent
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(calls).toBe(1);
  release({ action: 'cancel' });
  expect(await pending).toBe('cancelled');
  expect(calls).toBe(2);
});

test('answers all batch questions and replaces continuation state on another round', async () => {
  const responses: ToolRouterInputResponse[] = [
    { action: 'accept', content: { decision: 'approve' } },
    { action: 'decline' },
    { action: 'cancel' },
  ];
  let calls = 0;
  let answerIndex = 0;
  const result = await runWithApprovals(
    async options => {
      calls++;
      if (calls === 1)
        throw new ComposioToolInputRequiredError('Batch', {
          inputRequests: { first: question, second: question },
          requestState: 'first-state',
        });
      if (calls === 2) {
        expect(options).toEqual({
          inputResponses: { first: responses[0], second: responses[1] },
          requestState: 'first-state',
        });
        throw new ComposioToolInputRequiredError('Batch', {
          inputRequests: { next: question },
          requestState: 'next-state',
        });
      }
      expect(options).toEqual({
        inputResponses: { next: responses[2] },
        requestState: 'next-state',
      });
      return 'done';
    },
    async () => responses[answerIndex++]
  );
  expect(result).toBe('done');
});

test('propagates execution and UI failures without retrying', async () => {
  let calls = 0;
  await expect(
    runWithApprovals(
      async () => {
        calls++;
        throw new Error('network failure');
      },
      async () => {
        throw new Error('must not ask');
      }
    )
  ).rejects.toThrow('network failure');
  expect(calls).toBe(1);
  await expect(
    runWithApprovals(
      async () => {
        throw new ComposioToolInputRequiredError('Read', { inputRequests: { first: question } });
      },
      async () => {
        throw new Error('UI failed');
      }
    )
  ).rejects.toThrow('UI failed');
});

test('live verification rejects a completed batch with failed inner calls', () => {
  expect(() =>
    assertBatch(
      {
        total_count: 2,
        success_count: 0,
        error_count: 2,
        results: [{ error: 'upstream unavailable' }, { error: 'upstream unavailable' }],
      },
      2,
      0
    )
  ).toThrow();
});

test('live verification distinguishes an approval denial from an unrelated tool failure', () => {
  const batch = {
    total_count: 2,
    success_count: 1,
    error_count: 1,
    results: [
      { error: null, response: { successful: true, error: null } },
      { error: 'User denied tool approval', response: null },
    ],
  };
  expect(() => assertBatch(batch, 1, 1)).not.toThrow();
  batch.results[1].error = 'Upstream unavailable';
  expect(() => assertBatch(batch, 1, 1)).toThrow();
});
