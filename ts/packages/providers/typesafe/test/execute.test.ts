import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCallSession } from '@composio/core';
import {
  TypesafeAbstainedDecisionError,
  TypesafeConfirmationRequiredError,
  TypesafeIncompleteDecisionError,
  TypesafeMalformedDecisionError,
  TypesafeProvider,
  type TypesafeCallDecision,
  type TypesafeDecision,
  type TypesafePartialDecision,
} from '../src';

const meta = {
  model: 'jev-1.13',
  requestIds: ['req_1'],
  strategy: 'fan_out' as const,
  requestCount: 1,
};
const call: TypesafeCallDecision = {
  kind: 'call',
  tool: 'ISSUES_CREATE',
  arguments: { priority: 'low' },
  dropped: [],
  confidence: 0.9,
  judgements: [{ kind: 'routing', score: 0.9, required: true }],
  risk: 'mutating',
  requiresConfirmation: false,
  meta,
};
const partial: TypesafePartialDecision = {
  ...call,
  kind: 'partial',
  missing: [['body']],
  suggestions: {},
};
const abstain: TypesafeDecision = {
  kind: 'abstain',
  reason: 'none_fit',
  candidates: [],
  confidence: 0.2,
  meta,
};
const destructive: TypesafeCallDecision = {
  ...call,
  tool: 'REPOS_DELETE',
  risk: 'destructive',
  requiresConfirmation: true,
};

describe('execute', () => {
  let provider: TypesafeProvider;
  type ExecuteToolFn = Parameters<TypesafeProvider['_setExecuteToolFn']>[0];
  let executeTool: ReturnType<typeof vi.fn<ExecuteToolFn>>;
  const response = { data: { id: 7 }, error: null, successful: true };

  beforeEach(() => {
    // No client and no key: `execute` never reaches TypeSafe, so a stored decision runs later.
    provider = new TypesafeProvider();
    executeTool = vi.fn<ExecuteToolFn>().mockResolvedValue(response);
    provider._setExecuteToolFn(executeTool);
  });

  it('executes a deserialized call with its slug and arguments', async () => {
    expect(await provider.execute('user_1', JSON.parse(JSON.stringify(call)))).toBe(response);
    expect(executeTool).toHaveBeenCalledWith(
      'ISSUES_CREATE',
      expect.objectContaining({ arguments: { priority: 'low' }, userId: 'user_1' }),
      undefined
    );
  });

  it('merges caller arguments over Jev-bound ones, null included, and passes unknown keys through', async () => {
    await provider.execute('user_1', partial, {
      arguments: { body: null, priority: 'high', not_in_schema: 1 },
    });
    expect(executeTool.mock.calls[0][1].arguments).toEqual({
      priority: 'high',
      body: null,
      not_in_schema: 1,
    });
  });

  it('refuses an abstain, and a partial with gaps, listing the missing paths', async () => {
    await expect(provider.execute('user_1', abstain)).rejects.toBeInstanceOf(
      TypesafeAbstainedDecisionError
    );
    const error = await provider
      .execute('user_1', partial, { arguments: { body: undefined } })
      .catch(caught => caught);
    expect(error).toBeInstanceOf(TypesafeIncompleteDecisionError);
    expect(error.missing).toEqual([['body']]);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('forwards execution options and modifiers on the user-ID overload', async () => {
    const modifiers = { beforeExecute: vi.fn(), afterExecute: vi.fn() };
    await provider.execute('user_1', call, undefined, { connectedAccountId: 'ca_1' }, modifiers);
    expect(executeTool).toHaveBeenCalledWith(
      'ISSUES_CREATE',
      expect.objectContaining({ connectedAccountId: 'ca_1' }),
      modifiers
    );
  });

  it.each(['toString', 'constructor'])(
    'requires an explicitly supplied value for the argument %s',
    async name => {
      const decision: TypesafePartialDecision = { ...partial, missing: [[name]] };
      await expect(provider.execute('user_1', decision)).rejects.toMatchObject({
        name: 'TypesafeIncompleteDecisionError',
        missing: [[name]],
      });
      expect(executeTool).not.toHaveBeenCalled();

      await provider.execute('user_1', decision, { arguments: { [name]: 'supplied' } });
      expect(executeTool).toHaveBeenCalledExactlyOnceWith(
        'ISSUES_CREATE',
        expect.objectContaining({ arguments: { priority: 'low', [name]: 'supplied' } }),
        undefined
      );
    }
  );

  it('executes through a session, which takes no modifiers', async () => {
    const session = {
      execute: vi.fn().mockResolvedValue({ data: { ok: true }, error: null, logId: 'log_1' }),
    };
    const result = await provider.execute(session as ToolCallSession, partial, {
      arguments: { body: 'text' },
    });
    expect(session.execute).toHaveBeenCalledWith('ISSUES_CREATE', {
      priority: 'low',
      body: 'text',
    });
    expect(result).toMatchObject({ data: { ok: true }, successful: true });
    expect(executeTool).not.toHaveBeenCalled();

    await expect(
      // @ts-expect-error the session overload takes neither options nor modifiers
      provider.execute(session, call, undefined, undefined, { beforeExecute: vi.fn() })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('refuses a destructive decision without confirmation, even with the flag edited away', async () => {
    for (const decision of [destructive, { ...destructive, requiresConfirmation: false }]) {
      await expect(provider.execute('user_1', decision, { confirm: false })).rejects.toBeInstanceOf(
        TypesafeConfirmationRequiredError
      );
    }
    expect(executeTool).not.toHaveBeenCalled();
    await provider.execute('user_1', destructive, { confirm: true });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('throws the malformed-decision error before any execution', async () => {
    for (const malformed of [
      {},
      null,
      { ...call, confidence: 2 },
      { ...call, tool: '' },
      { ...partial, missing: [[]] },
    ]) {
      await expect(
        provider.execute('user_1', malformed as TypesafeDecision)
      ).rejects.toBeInstanceOf(TypesafeMalformedDecisionError);
    }
    expect(executeTool).not.toHaveBeenCalled();
  });
});
