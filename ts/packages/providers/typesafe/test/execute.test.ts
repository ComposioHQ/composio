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
const bound = {
  tool: 'ISSUES_CREATE',
  arguments: { priority: 'low' },
  dropped: [],
  confidence: 0.9,
  judgements: [{ kind: 'routing' as const, score: 0.9, required: true }],
  risk: 'mutating' as const,
  requiresConfirmation: false,
  meta,
};
const call: TypesafeCallDecision = { kind: 'call', ...bound };
const partial: TypesafePartialDecision = {
  kind: 'partial',
  ...bound,
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
  const systemOne = vi.fn();
  const response = { data: { id: 7 }, error: null, successful: true };

  beforeEach(() => {
    systemOne.mockReset();
    provider = new TypesafeProvider({ client: { systemOne } });
    executeTool = vi.fn<ExecuteToolFn>().mockResolvedValue(response);
    provider._setExecuteToolFn(executeTool);
  });

  it('executes a call with its slug and arguments and returns the response object', async () => {
    expect(await provider.execute('user_1', call)).toBe(response);
    expect(executeTool).toHaveBeenCalledWith(
      'ISSUES_CREATE',
      expect.objectContaining({ arguments: { priority: 'low' }, userId: 'user_1' }),
      undefined
    );
    expect(systemOne).not.toHaveBeenCalled();
  });

  it('AE6: completes a partial with caller arguments merged over Jev-bound ones', async () => {
    await provider.execute('user_1', partial, { arguments: { body: 'Steps to reproduce' } });
    expect(executeTool.mock.calls[0][1].arguments).toEqual({
      priority: 'low',
      body: 'Steps to reproduce',
    });
  });

  it('lets a caller value override a Jev-bound value', async () => {
    await provider.execute('user_1', call, { arguments: { priority: 'high' } });
    expect(executeTool.mock.calls[0][1].arguments).toEqual({ priority: 'high' });
  });

  it('accepts null for a missing entry and rejects undefined', async () => {
    await provider.execute('user_1', partial, { arguments: { body: null } });
    expect(executeTool.mock.calls[0][1].arguments).toEqual({ priority: 'low', body: null });
    await expect(
      provider.execute('user_1', partial, { arguments: { body: undefined } })
    ).rejects.toBeInstanceOf(TypesafeIncompleteDecisionError);
  });

  it('passes unknown caller keys through to backend validation', async () => {
    await provider.execute('user_1', call, { arguments: { not_in_schema: 1 } });
    expect(executeTool.mock.calls[0][1].arguments).toEqual({ priority: 'low', not_in_schema: 1 });
  });

  it('forwards execution options and modifiers on the user-ID overload', async () => {
    const modifiers = { beforeExecute: vi.fn(), afterExecute: vi.fn() };
    const customAuthParams = {
      parameters: [{ name: 'x-token', in: 'header' as const, value: 't' }],
    };
    await provider.execute(
      'user_1',
      call,
      undefined,
      { connectedAccountId: 'ca_1', customAuthParams },
      modifiers
    );
    expect(executeTool).toHaveBeenCalledWith(
      'ISSUES_CREATE',
      expect.objectContaining({ connectedAccountId: 'ca_1', customAuthParams }),
      modifiers
    );
  });

  it('executes through a session and passes no options object', async () => {
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
  });

  it('rejects modifiers on a session target at runtime and in the types', async () => {
    const session: ToolCallSession = { execute: vi.fn() };
    await expect(
      // @ts-expect-error the session overload takes neither options nor modifiers
      provider.execute(session, call, undefined, undefined, { beforeExecute: vi.fn() })
    ).rejects.toBeInstanceOf(TypeError);
    expect(session.execute).not.toHaveBeenCalled();
  });

  it('AE7: refuses a destructive decision without explicit confirmation', async () => {
    await expect(provider.execute('user_1', destructive)).rejects.toBeInstanceOf(
      TypesafeConfirmationRequiredError
    );
    await expect(
      provider.execute('user_1', destructive, { confirm: false })
    ).rejects.toBeInstanceOf(TypesafeConfirmationRequiredError);
    expect(executeTool).not.toHaveBeenCalled();
    await provider.execute('user_1', destructive, { confirm: true });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('still requires confirmation when a stored decision had requiresConfirmation edited to false', async () => {
    const edited = JSON.parse(JSON.stringify({ ...destructive, requiresConfirmation: false }));
    await expect(provider.execute('user_1', edited)).rejects.toBeInstanceOf(
      TypesafeConfirmationRequiredError
    );
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

  it('refuses an abstain, and a partial with gaps, listing the missing paths', async () => {
    await expect(provider.execute('user_1', abstain)).rejects.toBeInstanceOf(
      TypesafeAbstainedDecisionError
    );
    const error = await provider.execute('user_1', partial).catch(caught => caught);
    expect(error).toBeInstanceOf(TypesafeIncompleteDecisionError);
    expect(error.missing).toEqual([['body']]);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('executes a deserialized decision with no tool set present', async () => {
    const stored = JSON.stringify(call);
    const fresh = new TypesafeProvider();
    fresh._setExecuteToolFn(executeTool);
    await fresh.execute('user_2', JSON.parse(stored));
    expect(executeTool.mock.calls[0][1]).toMatchObject({
      userId: 'user_2',
      arguments: { priority: 'low' },
    });
  });
});
