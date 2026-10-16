import { describe, expect, it } from '@effect/vitest';
import { Option } from 'effect';
import { nonEmptyOrUndefined, optionalParams } from 'src/utils/optional-params';

describe('optionalParams', () => {
  it('keeps the value of a present flag and turns an absent one into undefined', () => {
    const params = optionalParams({
      cursor: Option.some('c_1'),
      from: Option.none<string>(),
      limit: Option.some(30),
    });

    expect(params).toEqual({ cursor: 'c_1', from: undefined, limit: 30 });
    expect(Object.keys(params)).toEqual(['cursor', 'from', 'limit']);
  });

  it('returns an empty record for no flags', () => {
    expect(optionalParams({})).toEqual({});
  });
});

describe('nonEmptyOrUndefined', () => {
  it('keeps a list that has elements', () => {
    expect(nonEmptyOrUndefined(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('turns an empty list into undefined', () => {
    expect(nonEmptyOrUndefined([])).toBeUndefined();
  });
});
