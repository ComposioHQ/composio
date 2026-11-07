import { describe, expect, it } from 'vitest';
import { isExecutionSuccessful, normalizeResponse } from 'src/services/tools-executor';

describe('isExecutionSuccessful', () => {
  it.each([
    {
      name: 'failed with a null error',
      raw: { result_type: 'failed' as const, error: null },
      expected: false,
    },
    {
      name: 'failed with an empty error',
      raw: { result_type: 'failed' as const, error: '' },
      expected: false,
    },
    {
      name: 'failed with a message',
      raw: { result_type: 'failed' as const, error: 'Boom' },
      expected: false,
    },
    { name: 'blocked', raw: { result_type: 'blocked' as const }, expected: false },
    { name: 'completed', raw: { result_type: 'completed' as const, error: null }, expected: true },
  ])('[Given] $name [Then] successful is $expected', ({ raw, expected }) => {
    expect(isExecutionSuccessful(raw)).toBe(expected);
  });
});

describe('normalizeResponse', () => {
  const completed = {
    result_type: 'completed' as const,
    data: { ok: true },
    error: null,
    log_id: 'log_test',
  };

  it('[Given] a response with instant_charge [Then] it yields instantCharge', () => {
    const response = normalizeResponse({
      ...completed,
      instant_charge: { amount: '0.005', currency: 'USD', charged_by: 'composio' },
    });

    expect(response.instantCharge).toEqual({
      amount: '0.005',
      currency: 'USD',
      chargedBy: 'composio',
    });
  });

  it('[Given] a response without instant_charge [Then] it has no instantCharge key', () => {
    const response = normalizeResponse(completed);

    expect(response).not.toHaveProperty('instantCharge');
    expect(response).toEqual({
      successful: true,
      data: { ok: true },
      error: null,
      logId: 'log_test',
    });
  });

  it('[Given] a call a session hook blocked [Then] it is a failed call with the hook message', () => {
    const response = normalizeResponse({
      result_type: 'blocked',
      reason: { type: 'request_blocked', hook_id: 'no_external_email' },
      message: 'Blocked by session policy: No external email',
    });

    expect(response).toEqual({
      successful: false,
      data: {},
      error: 'Blocked by session policy: No external email',
      logId: '',
    });
  });

  it('[Given] a blocked result of a call that ran [Then] it keeps the log id and the charge', () => {
    const response = normalizeResponse({
      result_type: 'blocked',
      reason: { type: 'response_blocked', hook_id: 'no_outside_data' },
      message: 'Blocked by session policy',
      log_id: 'log_456',
      instant_charge: { amount: '0.01', currency: 'USD', charged_by: 'composio' },
    });

    expect(response).toEqual({
      successful: false,
      data: {},
      error: 'Blocked by session policy',
      logId: 'log_456',
      instantCharge: { amount: '0.01', currency: 'USD', chargedBy: 'composio' },
    });
  });
});
