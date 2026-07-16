import { describe, expect, it } from 'vitest';
import { extractApiErrorDetails } from 'src/utils/api-error-extraction';

describe('extractApiErrorDetails', () => {
  it('extracts details from a well-formed API error body', () => {
    const details = extractApiErrorDetails({
      error: {
        message: 'Rate limited',
        slug: 'rate_limited',
        request_id: 'req_abc',
        code: 42901,
      },
    });

    expect(details).toMatchObject({
      message: 'Rate limited',
      slug: 'rate_limited',
      request_id: 'req_abc',
      code: 42901,
    });
  });

  it('keeps well-typed fields when a sibling field has an unexpected type', () => {
    const details = extractApiErrorDetails({
      error: {
        message: 42901,
        slug: 'rate_limited',
        request_id: 'req_abc',
      },
    });

    expect(details?.slug).toBe('rate_limited');
    expect(details?.request_id).toBe('req_abc');
    expect(details?.message).toBeUndefined();
  });

  it('prefers a node with strong fields over a weaker shallower node', () => {
    const details = extractApiErrorDetails({
      message: 'outer wrapper',
      error: {
        message: 'API says no',
        slug: 'tool_not_found',
      },
    });

    expect(details?.slug).toBe('tool_not_found');
    expect(details?.message).toBe('API says no');
  });

  it('skips Error wrappers but follows their cause chain', () => {
    const inner = { slug: 'expired_key', message: 'Key expired' };
    const wrapper = new Error('generic wrapper');
    Object.assign(wrapper, { cause: inner });

    expect(extractApiErrorDetails(wrapper)?.slug).toBe('expired_key');
  });

  it('returns undefined when nothing in the chain carries API fields', () => {
    expect(extractApiErrorDetails({ foo: 'bar' })).toBeUndefined();
    expect(extractApiErrorDetails(undefined)).toBeUndefined();
    expect(extractApiErrorDetails('plain string')).toBeUndefined();
  });
});
