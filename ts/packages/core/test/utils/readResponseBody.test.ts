import { describe, expect, it, vi } from 'vitest';
import { readResponseBodyWithLimit } from '../../src/utils/readResponseBody';

describe('readResponseBodyWithLimit', () => {
  it('rejects an oversized Content-Length before reading the body', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-length': '5' },
    });

    await expect(readResponseBodyWithLimit(response, 4)).rejects.toThrow(
      'exceeds maximum allowed size'
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.bodyUsed).toBe(true);
  });

  it('rejects and cancels a stream that exceeds the limit without a size header', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5]));
        },
        cancel,
      })
    );

    await expect(readResponseBodyWithLimit(response, 4)).rejects.toThrow(
      'exceeds maximum allowed size'
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('accepts a body exactly at the limit', async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { 'content-length': '4' },
    });

    await expect(readResponseBodyWithLimit(response, 4)).resolves.toEqual(
      new Uint8Array([1, 2, 3, 4])
    );
  });

  it('rejects invalid limits', async () => {
    await expect(readResponseBodyWithLimit(new Response(), -1)).rejects.toThrow(RangeError);
  });
});
