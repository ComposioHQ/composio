import { describe, expect, it } from 'vitest';
import { isExecutionSuccessful } from 'src/services/tools-executor';

describe('isExecutionSuccessful', () => {
  it.each([
    {
      name: 'failed with a null error',
      raw: { result_type: 'failed', error: null },
      expected: false,
    },
    {
      name: 'failed with an empty error',
      raw: { result_type: 'failed', error: '' },
      expected: false,
    },
    {
      name: 'failed with a message',
      raw: { result_type: 'failed', error: 'Boom' },
      expected: false,
    },
    { name: 'completed', raw: { result_type: 'completed', error: null }, expected: true },
    { name: 'no result_type and no error', raw: { error: null }, expected: true },
    { name: 'no result_type and an error', raw: { error: 'Boom' }, expected: false },
  ])('[Given] $name [Then] successful is $expected', ({ raw, expected }) => {
    expect(isExecutionSuccessful(raw)).toBe(expected);
  });
});
