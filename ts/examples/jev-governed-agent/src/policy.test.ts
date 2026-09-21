import { describe, expect, test } from 'bun:test';
import type { Tool, beforeExecuteModifier } from '@composio/core';
import { TypesafeGateVetoError } from '@composio/typesafe';
import {
  Blocked,
  MAX_ARGUMENT_BYTES,
  executionPolicy,
  policyHook,
  validateProposal,
} from './policy';

const read: Tool = {
  slug: 'GMAIL_FETCH_EMAILS',
  name: 'Fetch emails',
  tags: ['readOnlyHint'],
  inputParameters: {
    type: 'object',
    properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 5 } },
    required: ['query'],
    additionalProperties: false,
  },
};
const write: Tool = {
  slug: 'GMAIL_CREATE_EMAIL_DRAFT',
  name: 'Create draft',
  tags: [],
  inputParameters: {
    type: 'object',
    properties: { recipient_email: { type: 'string' }, body: { type: 'string' } },
    required: ['recipient_email', 'body'],
    additionalProperties: false,
  },
};
const readCall = { name: read.slug, arguments: '{"query":"is:unread from:github.com"}' };
const writeCall = {
  name: write.slug,
  arguments: '{"recipient_email":"alice@example.com","body":"Lunch is at noon"}',
};
const tools = [read, write];
const quiet = () => {};
const contextFor = (proposal: ReturnType<typeof validateProposal>) => ({
  toolSlug: proposal.tool.slug,
  toolkitSlug: 'gmail',
  params: { userId: 'test-user', arguments: proposal.args },
});

describe('local Gmail authorization', () => {
  test('requires metadata for reads, explicit approval for writes, and blocks other mutations', () => {
    expect(executionPolicy(read)).toBe('read');
    expect(executionPolicy({ ...write, tags: ['readOnlyHint'] })).toBe('confirm');
    expect(() => executionPolicy({ ...read, tags: [] })).toThrow(Blocked);
    expect(() => executionPolicy({ ...read, tags: ['readOnlyHint', 'destructiveHint'] })).toThrow(
      Blocked
    );
    expect(() => executionPolicy({ ...write, slug: 'GMAIL_IMPORT_MESSAGE' })).toThrow(Blocked);
  });

  test('hard blocks deletion and administration even with read-only metadata', () => {
    for (const slug of [
      'GMAIL_DELETE_MESSAGE',
      'GMAIL_DELETE_THREAD',
      'GMAIL_BATCH_DELETE_MESSAGES',
      'GMAIL_REMOVE_LABEL',
      'GMAIL_CREATE_FILTER',
      'GMAIL_GET_FILTER',
      'GMAIL_LIST_FILTERS',
      'GMAIL_GET_AUTO_FORWARDING',
      'GMAIL_LIST_FORWARDING_ADDRESSES',
      'GMAIL_UPDATE_SEND_AS',
      'GMAIL_SETTINGS_SEND_AS_GET',
      'GMAIL_GET_LANGUAGE_SETTINGS',
      'GMAIL_SETTINGS_GET_POP',
      'GMAIL_UPDATE_IMAP_SETTINGS',
      'GMAIL_GET_VACATION_SETTINGS',
      'GMAIL_LIST_CSE_IDENTITIES',
      'GMAIL_LIST_SMIME_INFO',
      'GMAIL_STOP_WATCH',
      'SLACK_SEARCH',
    ])
      expect(() => executionPolicy({ ...read, slug })).toThrow(Blocked);
  });

  test('rejects multiple calls, unknown tools, and known tools outside the shortlist', () => {
    for (const calls of [
      [],
      [readCall, writeCall],
      [{ ...readCall, name: 'GMAIL_UNKNOWN' }],
      [writeCall],
    ]) {
      expect(() => validateProposal(calls, [read])).toThrow(Blocked);
    }
  });

  test('rejects malformed JSON, non-objects, schema violations, and oversized arguments', () => {
    for (const args of [
      '',
      '{',
      '[]',
      'null',
      'true',
      '"text"',
      '{}',
      '{"query":3}',
      '{"query":"ok","max_results":1e999}',
      '{"query":"ok","extra":true}',
      '{"query":"ok","__proto__":{}}',
      JSON.stringify({ query: 'x'.repeat(MAX_ARGUMENT_BYTES) }),
    ]) {
      expect(() => validateProposal([{ ...readCall, arguments: args }], tools)).toThrow(Blocked);
    }
    expect(() => validateProposal([{ ...readCall, arguments: {} }], tools)).toThrow(Blocked);
    expect(() => validateProposal([readCall], [{ ...read, inputParameters: undefined }])).toThrow(
      Blocked
    );
  });

  test('retains exact input instead of inserting schema defaults', () => {
    expect(validateProposal([readCall], tools).args).toEqual({
      query: 'is:unread from:github.com',
    });
  });

  test('hard block runs before the gate or confirmation', async () => {
    const proposal = validateProposal([readCall], tools);
    proposal.tool = { ...read, slug: 'GMAIL_DELETE_MESSAGE' };
    const events: string[] = [];
    const hook = policyHook(
      proposal,
      context => {
        events.push('gate');
        return context.params;
      },
      async () => {
        events.push('confirm');
        return 'yes';
      },
      quiet
    );
    await expect(hook(contextFor(proposal))).rejects.toThrow('prohibited');
    expect(events).toEqual([]);
  });

  test('reads pass unchanged after the gate and never ask for confirmation', async () => {
    const proposal = validateProposal([readCall], tools);
    const events: string[] = [];
    const context = contextFor(proposal);
    const hook = policyHook(
      proposal,
      incoming => {
        events.push('gate');
        expect(incoming.params.arguments).toEqual(proposal.args);
        return incoming.params;
      },
      async () => {
        events.push('confirm');
        return 'yes';
      },
      quiet
    );
    expect(await hook(context)).toBe(context.params);
    expect(events).toEqual(['gate']);
    await expect(hook(context)).rejects.toThrow('one call');
  });

  test('writes require gate approval before exact confirmation', async () => {
    const proposal = validateProposal([writeCall], tools);
    const events: string[] = [];
    const hook = policyHook(
      proposal,
      context => {
        events.push('gate');
        return context.params;
      },
      async displayed => {
        events.push('confirm');
        expect(displayed.args).toEqual(proposal.args);
        return 'yes';
      },
      quiet
    );
    const context = contextFor(proposal);
    expect(await hook(context)).toBe(context.params);
    expect(events).toEqual(['gate', 'confirm']);
  });

  test('empty, EOF, malformed, non-exact, and failed confirmations deny', async () => {
    const proposal = validateProposal([writeCall], tools);
    const gate: beforeExecuteModifier = context => context.params;
    for (const answer of [undefined, '', 'y', 'YES', ' yes', 'yes ', 'yes\n', 'no']) {
      await expect(
        policyHook(proposal, gate, async () => answer, quiet)(contextFor(proposal))
      ).rejects.toThrow('Confirmation: denied');
    }
    await expect(
      policyHook(
        proposal,
        gate,
        async () => {
          throw new Error('input failed');
        },
        quiet
      )(contextFor(proposal))
    ).rejects.toThrow('Confirmation: denied');
  });

  test('vetoes and unavailable or malformed checks fail closed without confirmation', async () => {
    const proposal = validateProposal([writeCall], tools);
    for (const failure of [
      new TypesafeGateVetoError(0.1, 0.9),
      new Error('unavailable'),
      new Error('malformed'),
    ]) {
      let asked = false;
      const hook = policyHook(
        proposal,
        () => {
          throw failure;
        },
        async () => {
          asked = true;
          return 'yes';
        },
        quiet
      );
      await expect(hook(contextFor(proposal))).rejects.toThrow(Blocked);
      expect(asked).toBe(false);
    }
  });

  test('changed arguments or tool names never reach the gate', async () => {
    const proposal = validateProposal([writeCall], tools);
    for (const context of [
      { ...contextFor(proposal), toolSlug: read.slug },
      {
        ...contextFor(proposal),
        params: { arguments: { ...proposal.args, recipient_email: 'mallory@example.com' } },
      },
    ]) {
      let gated = false;
      const hook = policyHook(
        proposal,
        incoming => {
          gated = true;
          return incoming.params;
        },
        async () => 'yes',
        quiet
      );
      await expect(hook(context)).rejects.toThrow('call changed');
      expect(gated).toBe(false);
    }
  });
});
