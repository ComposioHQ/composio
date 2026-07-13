import { describe, expect, it } from 'vitest';
import { ChunkReassembler } from '../../src/utils/chunkReassembler';

const chunk = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  index: 0,
  chunk: '{"ok":',
  final: false,
  ...overrides,
});

describe('ChunkReassembler', () => {
  it('waits for every index through the declared final index', () => {
    const reassembler = new ChunkReassembler();

    expect(reassembler.add(chunk())).toEqual({ status: 'pending' });
    expect(reassembler.add(chunk({ index: 2, chunk: '}', final: true }))).toEqual({
      status: 'pending',
    });
    expect(reassembler.add(chunk({ index: 1, chunk: 'true' }))).toEqual({
      status: 'complete',
      payload: '{"ok":true}',
    });
    expect(reassembler.pendingCount).toBe(0);
  });

  it.each([
    null,
    chunk({ id: '' }),
    chunk({ index: -1 }),
    chunk({ index: 1.5 }),
    chunk({ index: 1_001 }),
    chunk({ chunk: 42 }),
    chunk({ final: 'false' }),
  ])('rejects malformed chunk data %#', data => {
    const reassembler = new ChunkReassembler();

    expect(reassembler.add(data).status).toBe('invalid');
    expect(reassembler.pendingCount).toBe(0);
  });

  it('discards an event when chunks exist beyond its final index', () => {
    const reassembler = new ChunkReassembler();

    expect(reassembler.add(chunk({ index: 2, chunk: 'extra' }))).toEqual({
      status: 'pending',
    });
    expect(reassembler.add(chunk({ index: 1, chunk: '}', final: true }))).toEqual({
      status: 'invalid',
      reason: 'received chunks beyond the final index',
    });
    expect(reassembler.pendingCount).toBe(0);
  });

  it('discards conflicting duplicate chunks', () => {
    const reassembler = new ChunkReassembler();

    reassembler.add(chunk({ chunk: 'first' }));
    expect(reassembler.add(chunk({ chunk: 'different' }))).toEqual({
      status: 'invalid',
      reason: 'conflicting duplicate chunk',
    });
    expect(reassembler.pendingCount).toBe(0);
  });

  it('expires incomplete events before accepting later chunks', () => {
    let now = 0;
    const reassembler = new ChunkReassembler({ ttlMs: 100, now: () => now });

    reassembler.add(chunk());
    now = 100;
    expect(reassembler.add(chunk({ index: 1, chunk: '}', final: true }))).toEqual({
      status: 'pending',
    });
    expect(reassembler.pendingCount).toBe(1);
  });

  it('evicts the oldest event when the pending-event cap is reached', () => {
    const reassembler = new ChunkReassembler({ maxPendingEvents: 1 });

    reassembler.add(chunk({ id: 'old' }));
    reassembler.add(chunk({ id: 'new' }));
    expect(reassembler.add(chunk({ id: 'new', index: 1, chunk: '}', final: true }))).toEqual({
      status: 'complete',
      payload: '{"ok":}',
    });

    expect(reassembler.add(chunk({ id: 'old', index: 1, chunk: '}', final: true }))).toEqual({
      status: 'pending',
    });
  });

  it('clears incomplete events', () => {
    const reassembler = new ChunkReassembler();
    reassembler.add(chunk());

    reassembler.clear();

    expect(reassembler.pendingCount).toBe(0);
  });
});
