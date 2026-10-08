import { describe, expect, it } from 'vitest';
import { isExecutionSuccessful } from 'src/services/tools-executor';

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
