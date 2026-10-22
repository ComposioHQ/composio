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
});
